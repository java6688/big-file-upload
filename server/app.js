const express = require('express');
const multer = require('multer');
const path = require('path'); // 用于处理文件路径
const fs = require('fs');
const app = express();
const Redis = require('ioredis')

const redis = new Redis({
    host: "stopstop.top",
    port: 6379,
    password: process.env.REDIS_PASSWORD,
});

// 测试连接
redis.ping().then(() => console.log("Redis connected"));

// 中间件：解析 JSON 请求体
app.use(express.json());
// 中间件：解析 URL 编码的请求体
app.use(express.urlencoded({ extended: true }));

// 解决跨域：允许所有来源、所有方法、所有请求头
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 切片存放路径
const chunkDir = path.join(process.cwd(), 'temp');
// 合并后的文件存放路径
const mergeDir = path.join(process.cwd(), 'upload');

// 配置 multer 的存储引擎
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('destination收到文件上传请求');
    // 判断项目根目录是否存在 temp 目录，不存在则创建
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }
    cb(null, chunkDir);
  },
  filename: function (req, file, cb) {
    console.log('filename收到文件上传请求', file);

    // const filename = decodeURIComponent(file.originalname)
    const filename = req.query.filename + '-' + req.query.index;

    cb(null, filename);
  }
});

function verifyChunks(req, res, next) {

  const filename = req.query.filename + '-' + req.query.index

  const chunkPath = path.join(chunkDir, filename);
  // 检查redis当中是否存在该文件
  // const isExistRedis = redis.get(chunkPath);
  // 检查当前切片文件是否已经存在
  const hasExistFile = fs.existsSync(chunkPath);
  // redis和文件检查双重保障，确保切片不存在时才上传isExistRedis &&
  if (hasExistFile) {
    // 直接响应。不再执行后续中间件，如后面的回调upload.single('chunk')、切片上传成功回调
    res.json({
      code: 200,
      message: '切片已存在',
    })
  } else {
    next()
  }
}

// 创建 multer 实例
const upload = multer({ storage: storage });

// 处理单文件上传。'video' 必须与前端的 input 的 name 属性一致。
app.post('/chunk', verifyChunks, upload.single('chunk'), (req, res) => {
  console.log('upload收到文件上传请求', req.body);
  // 上传成功后，文件信息在 req.file 中
  // console.log(req.file);
  // 把上传成功的文件名保存到redis，过期自动清除(EX秒)
  redis.set('chunks:' + req.file.filename, req.file.filename, 'EX', 60 * 10)
  res.send({
    code: 200,
    message: '切片上传成功',
    file: req.file
  });
});



// 验证切片接口

// 合并切片
app.post('/merge-chunk', (req, res) => {
  console.log('merge-chunk收到文件合并请求');
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).send({ code: '4000', message: '缺少文件名参数' });
  }
  // 合并后的文件路径，如果不存在则创建该目录
  if (!fs.existsSync(mergeDir)) {
    fs.mkdirSync(mergeDir, { recursive: true });
  }
  const mergeFilePath = path.join(mergeDir, filename);

  // 读取目录下所有切片文件，按 index 排序
  const chunkFilenames = fs.readdirSync(chunkDir)
    // 过滤出当前文件的切片文件
    .filter(name => name.startsWith(filename + '-'))
    // 按 index 排序
    .sort((a, b) => {
      const indexA = parseInt(a.split('-').pop(), 10);
      const indexB = parseInt(b.split('-').pop(), 10);
      return indexA - indexB;
    });

  console.log('合并文件', chunkFilenames);

  // 创建可写流，合并切片
  const writeStream = fs.createWriteStream(mergeFilePath);
  let mergedSize = 0;

  try {
    for (const filename of chunkFilenames) {
      // 创建可读流，读取切片
      const chunkPath = path.join(chunkDir, filename);
      // 读取切片
      const data = fs.readFileSync(chunkPath);
      // 写入合并后的文件
      writeStream.write(data);
      // 累加合并后的文件大小
      mergedSize += data.length;
      // 删除已合并的切片
      fs.unlinkSync(chunkPath);
      // redis当中删除该切片
      redis.del('chunks:' + filename);
    }
    // 合并完成后关闭流
    writeStream.end();
  } catch (err) {
    return res.status(500).send({ code: '5000', message: '合并失败', error: err.message });
  }

  res.send({
    code: '0000',
    message: '文件合并成功',
    file: {
      filename,
      size: mergedSize,
      path: mergeFilePath
    }
  });
});



// 启动服务器
app.listen(3000, () => {
  console.log('服务器运行在 http://localhost:3000');
});