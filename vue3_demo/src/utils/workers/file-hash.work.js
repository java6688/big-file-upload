// 在 hash-worker.js 中
// 引入 SparkMD5
// importScripts('/spark-md5@3.0.2/spark-md5.min.js');
importScripts('https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js');

self.onmessage = function (e) {
  const { chunks } = e.data;
  // 创建 SparkMD5 实例
  const spark = new SparkMD5.ArrayBuffer(); // 使用 SparkMD5[citation:7]

  // 读取切片
  function readChunk(index) {
    if (index >= chunks.length) {
      // 所有分片处理完毕，计算最终哈希[citation:7]
      const hash = spark.end();
      self.postMessage({ index, hash });
      // 所有分片处理完毕，关闭worker
      self.close();
      return;
    }

    const fileReader = new FileReader();
    fileReader.readAsArrayBuffer(chunks[index]); // 读取分片数据[citation:3]
    fileReader.onload = (e) => {
      spark.append(e.target.result); // 追加到 SparkMD5 实例[citation:7]
      self.postMessage({ index });
      // 读取下一个分片
      readChunk(index + 1);
    };
  }
  readChunk(0);
};