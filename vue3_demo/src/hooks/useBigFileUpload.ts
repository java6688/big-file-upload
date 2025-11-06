import axios, { type AxiosProgressEvent, type AxiosResponse } from "axios";
import { computed, markRaw, ref } from "vue";

const message = window.$message

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
};

export const useBigFileUpload = (
  props: Props = {
    chunkSize: 1024 * 1024 * 1,
  }
) => {
  const hasExistFile = ref(false);
  let isPuase = false;
  // 当前上传的文件
  let fileTarget: File | null = null;

  // 当前上传切片数组
  const chunks = ref<Chunk[]>([]);

  // 当前上传请求队列
  let chunkReqQueueList: ChunkRequestQueue[] = [];

  // 当前上传完成的切片/总切片数
  const percentage = computed(() => {
    if(hasExistFile.value) {
      return 100
    }
    const chunkSize = chunks.value.length;
    if (chunkSize === 0) {
      return 0;
    }
    const conpletedChunks = chunks.value.filter((chunk) => chunk.completed);
    console.log("已完成切片数", conpletedChunks.length);
    console.log("总切片数", chunkSize);
    return (conpletedChunks.length / chunkSize) * 100;
  });

  // 创建切片，切片大小可根据自身需求调整
  const createChunks = (
    file: File,
    chunkSize: number = props.chunkSize
  ): Chunk[] => {
    const chunks: Chunk[] = [];
    for (let i = 0, j = 0; i < file.size; i += chunkSize, j++) {
      chunks.push({
        chunk: markRaw(file.slice(i, i + chunkSize)),
        name: file.name + "-" + j,
        index: j,
        size: chunkSize,
        uploaded: 0,
        completed: false,
        requestSize: 0,
      });
    }
    return chunks;
  };

  // 上传切片
  const uploadChunkApi = (data: Chunk): ChunkRequestQueue => {
    const { name, index, chunk } = data;
    const formData = new FormData();
    formData.append("chunk", chunk);
    // formData.append("filename", filename);
    // formData.append("index", index.toString());

    // 创建中断请求器
    const abortController = new AbortController();

    const promise = axios
      .post(
        `http://localhost:3000/chunk?filename=${name}&index=${index}`,
        formData,
        {
          signal: abortController.signal,
          onUploadProgress: (progressEvent: AxiosProgressEvent) => {
            // 计算上传进度
            if (chunks.value[index] && progressEvent.total) {
              // 记录当前上传切片请求进度。
              // 注意，由于网络请求具有额外开销，上传进度可能会和切片大小不一样
              chunks.value[index].uploaded = progressEvent.loaded;
              chunks.value[index].requestSize = progressEvent.total;
            }
          },
        }
      )
      .then((res) => {
        if (chunks.value[index]) {
          chunks.value[index].completed = true;
        }
        // 处理完切片后，返回结果到下一个then回调
        return res;
      });

    return {
      promise,
      abortController,
    };
  };

  // 合并切片
  const mergeChunksApi = (filename: string) => {
    return axios.post("http://localhost:3000/merge-chunk", {
      filename,
    });
  };

  // 开始上传文件
  const startUpload = async (file: File, resume: boolean = false) => {
    if (!file) {
      message.error("请先选择文件!");
      return;
    }
    // 通过文件名检查是否已经上传了该文件
    const res = await axios.get('http://localhost:3000/check/file?filename=' + file.name)
    hasExistFile.value = res.data.hasExist
    if (res.data.hasExist) {
      console.log('文件已存在，无需重复上传')
      message.warning('文件已存在，无需重复上传')
      return;
    }

    // 恢复上传不用重新创建切片，延续之前的切片进度
    if (!resume) {
      fileTarget = file;
      chunks.value = createChunks(file);
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
      const index = chunk.index;

      const abortController = new AbortController();
      // 发生请求前先验证切片是否已经上传
      const res: AxiosResponse<{
        code: number;
        message: string;
        hasExist: boolean;
      }> = await axios.get(
        `http://localhost:3000/chunk/check?filename=${name}&index=${index}`,
        {
          signal: abortController.signal,
        }
      );

      if (isPuase) break;

      console.log(res, "下来了");
      if (res.data.hasExist) {
        chunkReqQueueList[i] = uploadChunkApi(chunk);
      } else {
        chunkReqQueueList[i] = {
          promise: Promise.resolve(res),
          abortController,
        };
        chunk.completed = true;
      }
    }

    if (chunkReqQueueList.length > 0) {
      const res = await Promise.all(
        chunkReqQueueList.map((item) => item.promise)
      );
      console.log("切片上传完成", res, chunkReqQueueList.length);

      mergeChunksApi(file.name);

      console.log("文件总大小", file.size);
      console.log(
        "切片总大小",
        chunks.value.reduce((acc, cur) => acc + cur.requestSize, 0)
      );
    }
  };

  // 暂停切片上传
  const pauseUpload = () => {
    isPuase = true;
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
    isPuase = false;
    startUpload(fileTarget!, true);
  };

  return {
    percentage,
    startUpload,
    pauseUpload,
    resumeUpload,
    chunks,
  };
};
