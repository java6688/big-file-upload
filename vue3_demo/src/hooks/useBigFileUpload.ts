import axios, { type AxiosProgressEvent, type AxiosResponse } from "axios";
import { createDiscreteApi } from "naive-ui";
import { computed, markRaw, ref } from "vue";

const baseUrl = "http://localhost:3000";

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

// 上传状态
export const UploadStatus = {
  // 暂停
  Pause: "pause",
  // 上传中
  Uploading: "uploading",
  // 完成
  Completed: "completed",
  // 等待上传
  Wait: "wait"
};

export const useBigFileUpload = (
  props: Props = {
    chunkSize: 1024 * 1024 * 1,
  }
) => {
  // 当前计算hash进度
  const hashProgress = ref(0);
  // 文件上传状态
  const state = ref(UploadStatus.Wait);
  // 服务器已存在该文件
  const hasExistFile = ref(false);
  // 当前上传的文件
  let fileTarget: File | null = null;
  // 文件哈希值
  let fileHash = "";

  // 当前上传切片数组
  const chunks = ref<Chunk[]>([]);

  // 当前上传请求队列
  let chunkReqQueueList: ChunkRequestQueue[] = [];

  // 当前上传完成的切片/总切片数
  const percentage = computed(() => {
    if (hasExistFile.value) {
      return 100;
    }
    const chunkSize = chunks.value.length;
    if (chunkSize === 0) {
      return 0;
    }
    const conpletedChunks = chunks.value.filter((chunk) => chunk.completed);
    return (conpletedChunks.length / chunkSize) * 100;
  });

  // axios实例化
  const http = axios.create({
    baseURL: baseUrl,
    // timeout: 10000,
  });

  http.interceptors.request.use(
    function (config: any) {
      return config;
    },
    function (error) {
      // 对请求错误做些什么
      return Promise.reject(error);
    }
  );

  // 添加响应拦截器
  http.interceptors.response.use(
    function (response) {
      return response;
    },
    function (error) {
      console.log("响应错误", error);
      return Promise.reject(error);
    }
  );

  // 创建切片，切片大小可根据自身需求调整
  const createChunks = (
    file: File,
    chunkSize: number = props.chunkSize
  ): Blob[] => {
    const chunks: Blob[] = [];
    for (let i = 0, j = 0; i < file.size; i += chunkSize, j++) {
      chunks.push(file.slice(i, i + chunkSize))
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

    const promise = http.post(
      `${baseUrl}/chunk?chunkName=${name}`,
      formData,
      {
        signal: abortController.signal,
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          // console.log('progressEvent', progressEvent)
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
      }
    );
    // .then((res) => {
    //   if (chunks.value[index]) {
    //     chunks.value[index].completed = true;
    //   }
    //   // 处理完切片后，返回结果到下一个then回调
    //   return res;
    // });

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
      // 导入vue3_demo\src\utils\workers\file-hash.work.js的worker
      const worker = new Worker(
        new URL("../utils/workers/file-hash.work.js", import.meta.url)
      );
      console.log(
        new URL("../utils/workers/file-hash.work.js", import.meta.url)
      );
      console.log(import.meta.url);
      worker.postMessage({
        chunks: tempChunks,
      });
      worker.onmessage = (e) => {
        const { index, hash } = e.data;
        // 计算当前计算hash进度
        if(tempChunks.length) {
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
      state.value = UploadStatus.Uploading;
      fileTarget = file;
      const tempChunks = createChunks(file);
      console.log("chunks", chunks);
      console.log(file.name.split(".").pop());
      fileHash = (await getHashWorker(tempChunks)) + "." + file.name.split(".").pop();
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
        }
      });
      // return
    }

    // 通过文件名检查是否已经上传了该文件
    const res = await http.get(`${baseUrl}/check/file?fileHash=${fileHash}`);
    hasExistFile.value = res.data.hasExist;
    if (res.data.hasExist) {
      console.log("文件已存在，无需重复上传");
      message.warning("文件已存在，无需重复上传");
      return;
    }

    // 创建切片上传请求队列
    // chunkReqQueueList = chunks.value
    //   // 过滤出未上传完成的切片
    //   .filter((chunk) => {
    //     return !chunk.completed;
    //   })
    //   // 创建切片上传请求
    //   .map((chunk) => {
    //     return uploadChunkApi(chunk);
    //   });
    const waitUploadChunks = chunks.value
      // 过滤出未上传完成的切片
      .filter((chunk) => {
        return !chunk.completed;
      });

    for (let i = 0; i < waitUploadChunks.length; i++) {
      const chunk = waitUploadChunks[i] as Chunk;
      const name = chunk.name;

      const abortController = new AbortController();
      // 发生请求前先验证切片是否已经上传
      const res: AxiosResponse<{
        code: number;
        message: string;
        hasExist: boolean;
      }> = await http.get(
        `${baseUrl}/chunk/check?chunkName=${name}`,
        {
          signal: abortController.signal,
        }
      );

      if (state.value === UploadStatus.Pause) return;

      if (res.data.hasExist) {
        chunkReqQueueList[i] = uploadChunkApi(chunk);
      } else {
        chunkReqQueueList[i] = {
          promise: Promise.resolve(res),
          abortController,
        };
        chunk.progress = 1;
        // chunk.completed = true;
      }
    }

    if (chunkReqQueueList.length > 0) {
      const res = await Promise.all(
        chunkReqQueueList.map((item) => item.promise)
      );
      console.log("切片上传完成", res, chunkReqQueueList.length);

      mergeChunksApi(fileHash);

      console.log("文件总大小", file.size);
      console.log(
        "切片总大小",
        chunks.value.reduce((acc, cur) => acc + cur.requestSize, 0)
      );
    }
  };

  // 暂停切片上传
  const pauseUpload = () => {
    state.value = UploadStatus.Pause;
    chunkReqQueueList.forEach((req) => {
      if (req.abortController) {
        req.abortController.abort("用户取消上传!");
      }
    });
    // 清空上传队列
    chunkReqQueueList = [];
  };

  // 恢复切片上传
  const resumeUpload = () => {
    state.value = UploadStatus.Uploading;
    startUpload(fileTarget!, true);
  };

  return {
    percentage,
    startUpload,
    pauseUpload,
    resumeUpload,
    chunks,
    state,
    hashProgress
  };
};
