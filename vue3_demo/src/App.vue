<template>
  <div>
    <form action="http://localhost:3000/upload" method="post"
      enctype="multipart/form-data"
    >
      <input type="file" @change="onUpload">
    </form>
  </div>
</template>

<script setup lang="ts">
import { useBigFileUpload } from './hooks/useBigFileUpload'

const { uploadChunkApi, createChunks, mergeChunksApi } = useBigFileUpload()

const onUpload = (e: any) => {
  console.log(e.target.files)
  const file = e.target.files[0]
  upload(file)
}
const upload = async (file: File) => {

  const chunks = createChunks(file)

  const reqs = chunks.map(chunk => {
    return uploadChunkApi(chunk)
  })

  await Promise.all(reqs)

  console.log('上传完成')

  mergeChunksApi(file.name)

}
</script>

<style scoped>

</style>
