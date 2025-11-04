export const useBigFileUpload = () => {
  // 创建切片，切片大小可根据自身需求调整
  const createChunks = (file: File, chunkSize: number = 1024 * 1024 * 10) => {
    const chunks = [];
    for (let i = 0, j = 0; i < file.size; i += chunkSize, j++) {
      chunks.push({
        filename: file.name,
        chunk: file.slice(i, i + chunkSize),
        index: j,
      });
    }
    return chunks;
  };

  // 上传切片
  const uploadChunkApi = (data: {
    filename: string;
    index: number;
    chunk: Blob;
  }) => {
    const { filename, index, chunk } = data;
    const formData = new FormData();
    formData.append("chunk", chunk);

    return fetch(
      `http://localhost:3000/chunk?filename=${filename}&index=${index}`,
      {
        method: "POST",
        body: formData,
      }
    );
  };

  // 合并切片
  const mergeChunksApi = (filename: string) => {
    return fetch(`http://localhost:3000/merge-chunk?filename=${filename}`, {
      method: "POST",
    });
  };

  return { createChunks, uploadChunkApi, mergeChunksApi };
};
