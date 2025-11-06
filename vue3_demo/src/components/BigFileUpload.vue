<template>
  <div class="upload-file">
    <n-upload @change="onUpload">
      <n-button>上传文件</n-button>
    </n-upload>
    <div class="percentage">
      <div>
        <span>上传进度：</span>
        <n-progress type="line" :percentage="percentage" />
      </div>
    </div>
    <div class="actions">
      <!-- <n-button v-if="isPause" type="primary" @click="onResume">继续</n-button>
      <n-button v-else type="default" @click="onPause">暂停</n-button> -->
      <n-button type="default" @click="onPause">暂停</n-button>
      <n-button type="primary" @click="onResume">继续</n-button>
      <n-button type="error" @click="onCancel">取消</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NUpload, NButton, useMessage, NProgress } from "naive-ui";
import type { UploadFileInfo } from "naive-ui";
import { useBigFileUpload } from "@/hooks/useBigFileUpload";

const { percentage, isPause, startUpload, pauseUpload, resumeUpload, cancelUpload } = useBigFileUpload();
const message = useMessage()

const onUpload = (data: {
  file: UploadFileInfo;
  fileList: Array<UploadFileInfo>;
  event?: Event;
}) => {
  console.log(data);
  const file = data.file.file;
  if (!file) {
    message.error('请选择文件!')
    return
  }
  startUpload(file);
};

const onPause = () => {
  pauseUpload();
};

const onResume = () => {
  resumeUpload();
};

const onCancel = () => {
  cancelUpload();
};

</script>

<style scoped>
.upload-file {
  width: 500px;
}
.actions {
  display: flex;
  gap: 10px;
}
</style>