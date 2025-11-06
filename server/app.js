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

const buildChunkname = (filename, index) => {
  return filename
}

const verifyChunks = (req, res) => {
  const chunkPath = path.join(chunkDir, buildChunkname(req.query.filename, req.query.index));
  // 检查当前切片文件是否已经存在
  const hasExistFile = fs.existsSync(chunkPath);
  console.log('hasExistFile', hasExistFile, chunkPath);
  if (hasExistFile) {
    // 直接响应。不再执行后续中间件，如后面的回调upload.single('chunk')、切片上传成功回调
    res.json({
      code: 200,
      message: '切片已存在，跳过该切片上传',
      hasExist: false
    })
    console.log('切片已存在，跳过该切片上传');
    return
  } else {
    // 切片不存在
    res.json({ code: 200, message: '切片不存在，继续上传', hasExist: true })
    console.log('切片不存在，继续上传');
  }
  return hasExistFile
}

// const verifyChunks = (req, res, next) => {
//   const chunkPath = path.join(chunkDir, buildChunkname(req.query.filename, req.query.index));
//   // 检查当前切片文件是否已经存在
//   const hasExistFile = fs.existsSync(chunkPath);
//   console.log('hasExistFile', hasExistFile, chunkPath);
//   return hasExistFile
//   if (hasExistFile) {
//     console.log('切片已存在，跳过该切片上传');
//     // 直接响应。不再执行后续中间件，如后面的回调upload.single('chunk')、切片上传成功回调
//     res.json({
//       code: 200,
//       message: '切片已存在，跳过该切片上传',
//       hasExist: false
//     })
//   } else {
//     next()
//   }
// }

// 验证切片是否已存在接口
app.get('/chunk/check', verifyChunks)

// 查询mergeDir目录下是否存在上传的文件
app.get('/check/file', (req, res) => {
  const filename = req.query.filename;
  const filePath = path.join(mergeDir, filename);
  const hasExistFile = fs.existsSync(filePath);
  console.log('hasExistFile', hasExistFile, filePath);
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

// 处理单文件上传。'video' 必须与前端的 input 的 name 属性一致。
app.post('/chunk', async (req, res) => {
  console.log('upload收到文件上传请求', req.body);

  const filename = req.query.filename;
  const chunkIndex = req.query.index;

  // 判断当前目录没有temp文件夹，则创建
  if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp', { recursive: true });
  }

  // 使用formidable解析表单数据
  const form = formidable({
    uploadDir: './temp', // 临时存储路径
    keepExtensions: true,
    filename: () => {
      return buildChunkname(filename, chunkIndex)
    }
  });

  try {
    // 解析表单数据，并把切片写入临时目录中
    const [fields, files] = await form.parse(req);
    console.log('fields', fields);
    // console.log('files', files);
    // const filename = fields.filename[0];
    // const chunkIndex = fields.index[0];
    const chunkFile = files.chunk[0];

    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }
    // 将临时文件移动到 chunkDir 目录
    const targetPath = path.join(chunkDir, buildChunkname(filename, chunkIndex));
    fs.renameSync(chunkFile.filepath, targetPath)
    console.log('分片上传成功', chunkIndex);
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
  console.log('merge-chunk收到文件合并请求', req.body);
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).send({ success: false, message: '缺少filename参数' });
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

  console.log('合并文件');

  // 创建可写流，合并切片
  const writeStream = fs.createWriteStream(mergeFilePath);
  let mergedSize = 0;

  try {
    for (const chunkname of chunkFilenames) {
      // 创建可读流，读取切片
      const chunkPath = path.join(chunkDir, chunkname);
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
    return res.status(500).send({ success: false, message: '合并失败!', error: err.message });
  }

  res.send({
    success: true,
    message: '文件合并成功',
    file: {
      filename,
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