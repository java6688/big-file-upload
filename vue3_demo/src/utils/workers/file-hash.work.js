// 在 utils/workers/file-hash.work.js 中
// 引入 SparkMD5 计算文件内容hash
// importScripts('/spark-md5@3.0.2/spark-md5.min.js');
importScripts('https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js');

self.onmessage = function (e) {
  // 从主线程接收分片数据
  const { chunks } = e.data;
  // 创建 SparkMD5 实例
  const spark = new SparkMD5.ArrayBuffer();

  // 读取切片
  function readChunk(index) {
    if (index >= chunks.length) {
      // 所有分片处理完毕，计算最终哈希
      const hash = spark.end();
      // 向主线程发送最终计算的哈希值
      self.postMessage({ index, hash });
      // 所有分片处理完毕，关闭worker
      self.close();
      return;
    }

    // 创建 FileReader 实例, 用于读取分片数据
    const fileReader = new FileReader();
    // 读取分片数据
    fileReader.readAsArrayBuffer(chunks[index]);
    // 分片数据加载完成事件监听
    fileReader.onload = (e) => {
      // 追加到 SparkMD5 实例
      spark.append(e.target.result);
      // 向主线程发送计算进度索引
      self.postMessage({ index });
      // 读取下一个分片
      readChunk(index + 1);
    };
  }
  // 从索引0开始读取分片
  readChunk(0);
};