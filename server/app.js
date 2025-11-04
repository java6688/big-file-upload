const express = require('express');
const multer = require('multer');
const path = require('path'); // 用于处理文件路径
const fs = require('fs');
const app = express();

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
    console.log(req.query)

    const filename = req.query.filename + '-' + req.query.index;

    cb(null, filename);
  }
});

// 创建 multer 实例
const upload = multer({ storage: storage });

// 处理单文件上传。'video' 必须与前端的 input 的 name 属性一致。
app.post('/chunk', upload.single('chunk'), (req, res) => {
  console.log('upload收到文件上传请求');
  // 上传成功后，文件信息在 req.file 中
  console.log(req.file);
  res.send({
    code: '0000',
    message: '文件上传成功',
    file: req.file
  });
});

// 合并切片
app.post('/merge-chunk', (req, res) => {
  console.log('merge-chunk收到文件合并请求');
  const { filename } = req.query;
  if (!filename) {
    return res.status(400).send({ code: '4000', message: '缺少文件名参数' });
  }

  // 合并后的文件路径
  const mergeFilePath = path.join(chunkDir, filename);

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