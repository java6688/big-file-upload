import axios, { type AxiosProgressEvent, type AxiosResponse } from "axios";
import { createDiscreteApi } from "naive-ui";
import { computed, markRaw, ref } from "vue";

const baseUrl = "http://localhost:3000";

// axios实例化
const http = axios.create({
  baseURL: baseUrl,
});

const { message } = createDiscreteApi(["message"]);

type Props = {
  chunkSize: number;
};

type ChunkRequestQueue = {
  promise: Promise<AxiosResponse>;
  abortController: AbortController;
};

export type Chunk = {
  // 切片数据
  chunk: Blob;
  // 当前切片索引
  index: number;
  // 切片文件名
  name: string;
  // 总大小
  size: number;
  // 已上传大小
  uploaded: number;
  // 请求总进度
  requestSize: number;
  // 是否完成上传
  completed: boolean;
  // 上传进度
  progress: number;
};

export const useBigFileUpload = (
  props: Props = {
    chunkSize: 1024 * 1024 * 1,
  }
) => {

  // 当前计算hash进度
  const hashProgress = ref(0);

  // 是否暂停了上传
  const isPuase = ref(false);

  // 当前上传的文件
  let fileTarget: File | null = null;

  // 文件哈希值+文件后缀名
  let fileHash = "";

  // 当前上传切片数组
  const chunks = ref<Chunk[]>([]);

  // 当前上传请求队列
  let chunkReqQueueList: ChunkRequestQueue[] = [];

  // 当前上传完成的切片/总切片数
  const percentage = computed(() => {
    const chunkSize = chunks.value.length;
    if (chunkSize === 0) {
      return 0;
    }
    const conpletedChunks = chunks.value.filter((chunk) => chunk.completed);
    return (conpletedChunks.length / chunkSize) * 100;
  });

  // 创建切片，切片大小可根据自身需求调整
  const createChunks = (
    file: File,
    chunkSize: number = props.chunkSize
  ): Blob[] => {
    const chunks: Blob[] = [];
    for (let i = 0, j = 0; i < file.size; i += chunkSize, j++) {
      chunks.push(file.slice(i, i + chunkSize));
    }
    return chunks;
  };

  // 上传切片
  const uploadChunkApi = (data: Chunk): ChunkRequestQueue => {
    const { name, index, chunk } = data;
    const formData = new FormData();
    formData.append("chunk", chunk);

    // 创建中断请求器
    const abortController = new AbortController();

    const promise = http.post(`${baseUrl}/chunk?chunkName=${name}`, formData, {
      signal: abortController.signal,
      onUploadProgress: (progressEvent: AxiosProgressEvent) => {
        // 计算上传进度
        if (
          chunks.value[index] &&
          progressEvent.total &&
          progressEvent.progress
        ) {
          // 记录当前上传切片请求进度。
          // 注意，由于网络请求具有额外开销，上传进度可能会和切片大小不一样
          chunks.value[index].uploaded = progressEvent.loaded;
          chunks.value[index].requestSize = progressEvent.total;
          // 计算上传进度
          chunks.value[index].progress = progressEvent.progress;
        }
      },
    });

    return {
      promise,
      abortController,
    };
  };

  // 合并切片
  const mergeChunksApi = (fileHash: string) => {
    return http.post(`http://localhost:3000/merge-chunk`, {
      fileHash,
    });
  };

  const getHashWorker = async (tempChunks: Blob[]): Promise<string> => {
    hashProgress.value = 0;
    return new Promise((resolve) => {
      // 导入worker线程，计算文件哈希值
      const worker = new Worker(
        new URL("../utils/workers/file-hash.work.js", import.meta.url)
      );
      // 向worker线程发送消息，计算文件哈希值
      worker.postMessage({
        chunks: tempChunks,
      });
      // 监听worker线程消息，获取计算文件哈希值结果
      worker.onmessage = (e) => {
        const { index, hash } = e.data;
        // 计算当前计算hash进度
        if (tempChunks.length) {
          hashProgress.value = (index / tempChunks.length) * 100;
        }
        if (hash) {
          // 完成计算哈希值
          resolve(hash);
        }
      };
    });
  };

  // 构建hash文件名
  const buildChunkName = (hash: string, index: number) => {
    return `${hash}-${index}`;
  };

  // 开始上传文件
  const startUpload = async (file: File, resume: boolean = false) => {
    if (!file) {
      message.error("请先选择文件!");
      return;
    }

    // 恢复上传不用重新创建切片，延续之前的切片进度
    if (!resume) {
      fileTarget = file;
      // 重置暂停状态，避免重复上传时暂停状态为true导致问题
      isPuase.value = false;
      // 创建切片
      const tempChunks = createChunks(file);
      // 计算文件哈希值，并拼接文件后缀名
      fileHash =
        (await getHashWorker(tempChunks)) + "." + file.name.split(".").pop();
      // 构建切片对象数组
      chunks.value = tempChunks.map((chunk, i) => {
        return {
          name: buildChunkName(fileHash, i),
          chunk: markRaw(chunk),
          index: i,
          size: props.chunkSize,
          uploaded: 0,
          requestSize: 0,
          progress: 0,
          get completed() {
            return this.progress === 1;
          },
        };
      });
    }

    // 通过文件名检查是否已经上传了该文件
    const res = await http.get(`${baseUrl}/check/file?fileHash=${fileHash}`);
    if (res.data.hasExist) {
      message.warning("文件已存在，无需重复上传");
      return;
    }

    // 过滤出未上传完成的切片
    const waitUploadChunks = chunks.value
      .filter((chunk) => {
        return !chunk.completed;
      });


    for (let i = 0; i < waitUploadChunks.length; i++) {
      const chunk = waitUploadChunks[i] as Chunk;
      const name = chunk.name;

      // 创建中断请求器
      const abortController = new AbortController();

      // 发生请求前先验证切片是否已经上传
      const res: AxiosResponse<{
        code: number;
        message: string;
        hasExist: boolean;
      }> = await http.get(`${baseUrl}/chunk/check?chunkName=${name}`, {
        signal: abortController.signal,
      });

      // 暂停了直接退出for循环，且不再执行for循环后面的代码
      if (isPuase.value) return;

      if (res.data.hasExist) {
        chunkReqQueueList[i] = {
          // 返回校验结果
          promise: Promise.resolve(res),
          // 校验切片是否存在中断器
          abortController,
        };
        chunk.progress = 1;
        // chunk.completed = true;
      } else {
        // 切片不存在，继续上传
        chunkReqQueueList[i] = uploadChunkApi(chunk);
      }
    }

    if (chunkReqQueueList.length > 0) {
      await Promise.all(
        chunkReqQueueList.map((item) => item.promise)
      );

      // 合并切片
      await mergeChunksApi(fileHash);
    }
  };

  // 暂停切片上传
  const pauseUpload = () => {
    if (!isPuase.value) {
      isPuase.value = true;
      chunkReqQueueList.forEach((req) => {
        if (req.abortController) {
          req.abortController.abort("用户取消上传!");
        }
      });
      // 清空上传队列
      chunkReqQueueList = [];
    } else {
      message.warning("文件已暂停上传！");
    }
  };

  // 恢复切片上传
  const resumeUpload = () => {
    if (fileTarget && isPuase.value) {
      isPuase.value = false;
      startUpload(fileTarget, true);
    } else {
      message.warning("文件正在上传中！");
    }
  };

  return {
    percentage,
    startUpload,
    pauseUpload,
    resumeUpload,
    chunks,
    isPuase,
    hashProgress,
  };
};
