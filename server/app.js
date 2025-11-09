const express = require('express');
const path = require('path'); // 用于处理文件路径
const fs = require('fs');
const app = express();
const { formidable } = require('formidable');

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
const chunkDir = path.join(process.cwd(), 'chunks');
// 合并后的文件存放路径
const mergeDir = path.join(process.cwd(), 'upload');

// 验证切片是否已存在接口
app.get('/chunk/check', (req, res) => {

  // 切片文件名称
  const chunkName = req.query.chunkName

  // 从切片文件名称中提取文件hash
  const fileHash = extractFileHash(chunkName);

  // 待合并的分片目录路径
  const chunkPath = path.join(chunkDir, fileHash, chunkName);

  // 检查当前切片文件是否已经存在
  const hasExistFile = fs.existsSync(chunkPath);
  console.log('hasExistFile', hasExistFile, chunkPath);
  if (hasExistFile) {
    // 直接响应。不再执行后续中间件，如后面的回调upload.single('chunk')、切片上传成功回调
    res.json({
      code: 200,
      message: '切片已存在，跳过该切片上传',
      hasExist: true
    })
    return
  } else {
    // 切片不存在
    res.json({ code: 200, message: '切片不存在，继续上传', hasExist: false })
  }
  return hasExistFile
})

// 查询mergeDir目录下是否存在上传的文件
app.get('/check/file', (req, res) => {
  const fileHash = req.query.fileHash;
  const filePath = path.join(mergeDir, fileHash);
  const hasExistFile = fs.existsSync(filePath);
  if (hasExistFile) {
    res.json({
      code: 200,
      message: '文件已存在',
      hasExist: true
    })
  } else {
    res.json({
      code: 200,
      message: '文件不存在',
      hasExist: false
    })
  }
})

// 从分片名称提取文件hash，如：chunkName=91a509c780df16d509e69d604292e870.mp4-0
function extractFileHash(chunkName) {
  return chunkName.split('-')[0];
}

// 处理分片文件上传。
app.post('/chunk', async (req, res) => {

  // 分片保存的文件名称
  const chunkName = req.query.chunkName;

  // 从分片名称中提取大文件的文件内容hash
  const fileHash = extractFileHash(chunkName);

  // 判断当前目录没有temp文件夹，则创建
  if (!fs.existsSync('./temp')) {
    // 创建接收前端传输的分片数据，写入临时存放目录
    fs.mkdirSync('./temp', { recursive: true });
  }

  // 使用formidable解析表单文件数据
  const form = formidable({
    // 分片临时存储路径，等数据写入完整再移动到待合并的分片目录，保证分片的完整性
    uploadDir: './temp',
    keepExtensions: true,
    filename: () => {
      // 自定义分片文件名称
      return chunkName
    }
  });

  try {
    // 解析表单数据，开始把切片写入临时目录中
    const [fields, files] = await form.parse(req);

    // 分片写入完成，从解析后的文件中获取分片文件对象
    const chunkFile = files.chunk[0];

    // 创建 chunkDir 目录，如果目录不存在
    if (!fs.existsSync(chunkDir)) {
      // 创建待合并的分片目录
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    // 将临时文件移动到待合并的分片目录中
    const fileHashDir = path.join(chunkDir, fileHash);

    // 创建文件 hash 目录，如果目录不存在
    const targetPath = path.join(fileHashDir, chunkName);

    // 创建文件hash目录，如果目录不存在
    // (如目录名称：91a509c780df16d509e69d604292e870.mp4)
    if (!fs.existsSync(fileHashDir)) {
      fs.mkdirSync(fileHashDir, { recursive: true });
    }

    // 移动文件到待合并的分片目录中，上面写入完成的分片路径
    // 如(chunkFile.filepath)：./temp/91a509c780df16d509e69d604292e870.mp4-0
    fs.renameSync(chunkFile.filepath, targetPath)
  } catch (error) {
    return res.status(500).json({ msg: '分片上传失败', error: error });
  }

  res.send({
    code: 200,
    message: '切片上传成功',
    file: req.file
  });
});

// 合并切片
app.post('/merge-chunk', (req, res) => {
  const { fileHash } = req.body;
  if (!fileHash) {
    return res.status(400).send({ success: false, message: '缺少fileHash参数' });
  }
  // 合并后的文件路径，如果不存在则创建该目录
  if (!fs.existsSync(mergeDir)) {
    fs.mkdirSync(mergeDir, { recursive: true });
  }
  const mergeFilePath = path.join(mergeDir, fileHash);
  const chunkHashDir = path.join(chunkDir, fileHash);

  // 读取目录下所有切片文件，按 index 排序
  const chunkFilenames = fs.readdirSync(chunkHashDir)
    // 按 index 排序
    .sort((a, b) => {
      const indexA = parseInt(a.split('-').pop(), 10);
      const indexB = parseInt(b.split('-').pop(), 10);
      return indexA - indexB;
    });

  // 创建可写流，合并切片
  const writeStream = fs.createWriteStream(mergeFilePath);
  let mergedSize = 0;

  try {
    for (const chunkname of chunkFilenames) {
      // 创建可读流，读取切片
      const chunkPath = path.join(chunkHashDir, chunkname);
      // 读取切片
      const data = fs.readFileSync(chunkPath);
      // 写入合并后的文件
      writeStream.write(data);
      // 累加合并后的文件大小
      mergedSize += data.length;
      // 删除已合并的切片
      fs.unlinkSync(chunkPath);
    }
    // 删除空目录
    fs.rmdirSync(chunkHashDir);
    // 合并完成后关闭流
    writeStream.end();
  } catch (err) {
    return res.status(500).send({ success: false, message: '合并失败!', error: err.message });
  }

  res.send({
    success: true,
    message: '文件合并成功',
    file: {
      fileHash,
      size: mergedSize,
      path: mergeFilePath,
      chunkFilenames
    }
  });
});



// 启动服务器
app.listen(3000, () => {
  console.log('服务器运行在 http://localhost:3000');
});