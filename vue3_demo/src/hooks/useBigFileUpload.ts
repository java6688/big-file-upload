import axios, { type AxiosProgressEvent, type AxiosResponse } from "axios";
import { ref, computed } from "vue";
import { useMessage } from "naive-ui";

const message = useMessage();

interface Props {
  chunkSize: number;
}

interface UploadChunkQueue {
  promise: Promise<AxiosResponse>;
  abortController: AbortController;
}

interface Chunk {
  index: number;
  chunk: Blob;
  filename: string;
}

// 当前上传状态值
export const UploadStatus = {
  // 上传中
  Uploading: 'uploading',
  // 上传完成
  Completed: 'completed',
  // 上传中断
  Failed: 'failed',
}

export const useBigFileUpload = (
  props: Props = {
    chunkSize: 1024 * 1024 * 0.1,
  }
) => {

  // 当前上传的文件
  let fileTarget: File | null = null;

  // 各切片已上传进度
  const chunkProgressList = ref<number[]>([]);

  // 当前上传切片数组
  let chunks: Chunk[] = []

  // 当前上传队列
  let chunkReqQueueList: UploadChunkQueue[] = [];

  // 旧的上传进度
  let oldProgress = 0;

  // 是否暂停切片上传
  const isPause = ref(false);

  // 初始化所有状态
  const init = () => {
    fileTarget = null
    chunkProgressList.value = []
    chunkReqQueueList = []
    oldProgress = 0
  }

  // 根据切片上传进度计算文件的上传进度
  const percentage = computed(() => {
    if (chunkProgressList.value.length === 0) {
      return 0;
    }
    const current = chunkProgressList.value.reduce(
      (pre, cur) => pre + cur,
      0
    );
    const fileSize = fileTarget?.size || 0;

    const value = Math.floor((current / fileSize) * 100)

    // 避免断点续传的进度条倒退
    if(oldProgress >= value) {
      return oldProgress;
    }
    // 保存进度
    oldProgress = value;
    return value;
  });

  // 创建切片，切片大小可根据自身需求调整
  const createChunks = (file: File, chunkSize: number = props.chunkSize): Chunk[] => {
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
  }): UploadChunkQueue => {
    const { filename, index, chunk } = data;
    const formData = new FormData();
    formData.append("chunk", chunk);

    // 创建中断请求器
    const abortController = new AbortController();

    const promise = axios.post(
      `http://localhost:3000/chunk?filename=${filename}&index=${index}`,
      formData,
      {
        signal: abortController.signal,
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          // 计算上传进度
          if (progressEvent.lengthComputable) {
            // 记录当前切片上传进度
            chunkProgressList.value[index] = progressEvent.loaded
          }
        },
      }
    )

    return {
      promise,
      abortController
    }
  };

  // 合并切片
  const mergeChunksApi = (filename: string) => {
    return axios.post('http://localhost:3000/merge-chunk', {
      filename
    });
  };

  // 开始上传文件
  const startUpload = async (file: File, resume: boolean = false) => {

    // 不是恢复上传，需要初始化各切片上传进度、切片上传状态
    if(!resume) {
      init()
      // 记录文件，恢复上传、计算上传进度
      fileTarget = file;
      chunks = createChunks(file);
    }

    // 创建切片上传请求队列
    chunkReqQueueList = chunks.map((chunk) => {
      return uploadChunkApi(chunk);
    });
    await Promise.all(chunkReqQueueList.map((item) => item.promise));

    console.log("切片上传完成");

    mergeChunksApi(file.name);
  };

  // 暂停切片上传
  const pauseUpload = () => {
    isPause.value = true;
    chunkReqQueueList.forEach((req) => {
      req.abortController.abort("用户取消上传!");
    });
    // 清空上传队列
    chunkReqQueueList = []
  };

  // 恢复切片上传
  const resumeUpload = () => {
    isPause.value = false;
    if(!fileTarget) {
      message.error("请先选择文件!");
      return;
    }
    startUpload(fileTarget!);
  };

  // 取消上传
  const cancelUpload = () => {
    chunkReqQueueList.forEach((req) => {
      req.abortController.abort("用户取消上传!");
    });
    init()
  };

  return { percentage, isPause, startUpload, pauseUpload, resumeUpload, cancelUpload };
};
