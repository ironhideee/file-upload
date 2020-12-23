import { Component } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { UploadFile } from 'ng-zorro-antd/upload';
import { HttpService } from 'src/service/http.service';
import { forkJoin } from 'rxjs'
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.less']
})
export class AppComponent {

  uploading = false;
  fileList: UploadFile[] = [];
  Status = {
    wait: "wait",
    pause: "pause",
    uploading: "uploading"
  };
  SIZE = 0.5 * 1024 * 1024; // 切片大小
  container = {
    file: null,
    hash: null,
    worker: null
  }
  hashPercentage: 0
  data = [];
  requestList = [];
  status = this.Status.wait
  // 当暂停时会取消 xhr 导致进度条后退
  // 为了避免这种情况，需要定义一个假的进度条
  fakeUploadPercentage = 0;
  shouldUpload: boolean;
  uploadedList;
  fileChunkList; //切片文件

  constructor(
    private msg: NzMessageService,
    private httpCall: HttpService,
    private http: HttpClient, 
  ) {}

  ngOnInit(): void {
    
  }

  ngOnChanges() {
    if (!this.container.file || !this.data.length) return 0;
    const loaded = this.data
      .map(item => item["size"] * item["percentage"])
      .reduce((acc, cur) => acc + cur);
    let now = parseInt((loaded / this.container.file.size).toFixed(2));
    console.log("test==="+now)
    if (now > this.fakeUploadPercentage) {
      this.fakeUploadPercentage = now;
    }
  }

  handlePause(){
    this.status = this.Status.pause;
    this.resetData();
  }

  resetData() {
    //this.requestList.forEach((xhr:any) => xhr?.abort());
    this.requestList = [];
    if (this.container.worker) {
      this.container.worker.onmessage = null;
    }
  }

  //恢复上传
  handleResume() {
    this.status = this.Status.uploading;
    this.verifyUpload(
      this.container.file.name,
      this.container.hash
    )
  }

  beforeUpload = (file: UploadFile): boolean => {
    this.fileList = this.fileList.concat(file);
    this.container.file = file;
    return false;
  };

  async handleUpload(){
    this.status = this.Status.uploading;
    this.fileChunkList = this.createFileChunk(this.container.file);
    this.container.hash = await this.calculateHash(this.fileChunkList);
    this.verifyUpload(
      this.container.file.name,
      this.container.hash
    );
  }

  // 生成文件切片
  createFileChunk(file, size = this.SIZE) {
    const fileChunkList = [];
    let cur = 0;
    while (cur < file.size) {
      fileChunkList.push({ file: file.slice(cur, cur + size) });
      cur += size;
    }
    return fileChunkList;
  }

  // 生成文件 hash（web-worker）
  calculateHash(fileChunkList) {
    return new Promise(resolve => {
      this.container.worker = new Worker("assets/public/hash.js");
      this.container.worker.postMessage({ fileChunkList });
      this.container.worker.onmessage = e => {
        const { percentage, hash } = e.data;
        this.hashPercentage = percentage;
        if (hash) {
          resolve(hash);
        }
      };
    });
  }

  // 根据 hash 验证文件是否曾经已经被上传过
  // 没有才进行上传
  verifyUpload(filename, fileHash) {
    let params = JSON.stringify({
      filename,
      fileHash
    })
    this.httpCall.verify(params).subscribe((res:any)=>{
      this.shouldUpload = res.shouldUpload;
      this.uploadedList = res.uploadedList;
      if (!this.shouldUpload) {
        this.msg.success("秒传：上传成功");
        this.status = this.Status.wait;
        return;
      }
      this.data = this.fileChunkList.map(({ file }, index) => ({
        fileHash: this.container.hash,
        index,
        hash: this.container.hash + "-" + index,
        chunk: file,
        size: file.size,
        percentage: this.uploadedList.includes(index) ? 100 : 0
      }));
      //console.log(this.data)
      this.uploadChunks(this.uploadedList);
    })
  }

  // 上传切片，同时过滤已上传的切片
  uploadChunks(uploadedList = []) {
    const requestList = this.data
      .filter(({ hash }) => !uploadedList.includes(hash))
      .map(({ chunk, hash, index }) => {
        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("hash", hash);
        formData.append("filename", this.container.file.name);
        formData.append("fileHash", this.container.hash);
        return { formData, index };
      })
      .map(({ formData,index }) =>{
        return {index: index,request:this.httpCall.upload(formData)}
        //return this.httpCall.upload(formData);
        // 两种调用方式都可以
        // const req = new HttpRequest('POST', 'http://localhost:3000', formData);
        // return this.http.request(req)
      });
      requestList.forEach(item => {
        item.request.subscribe(event=>{
          if(event.type === HttpEventType.UploadProgress){
            this.data[item.index].percentage = Math.round(100 * event.loaded / event.total);
          }
        })
      });
      setTimeout(()=>{
        if (this.uploadedList.length + requestList.length === this.data.length) {
          this.mergeRequest();
        }
      },1000)
      return
      forkJoin(requestList).subscribe(event=>{
        console.log(event)
        // event.forEach((item,index) => {
        //   if(item.type === HttpEventType.UploadProgress){
        //     this.data["index"].percentage = Math.round(100 * item.loaded / item.total);
        //   }
        // });
        console.log(this.data)
        // 之前上传的切片数量 + 本次上传的切片数量 = 所有切片数量时
        // 合并切片
        if (this.uploadedList.length + requestList.length === this.data.length) {
          this.mergeRequest();
        }
      })
  }

  // 通知服务端合并切片
  mergeRequest() {
    let params = JSON.stringify({
      size: this.SIZE,
      fileHash: this.container.hash,
      filename: this.container.file.name
    })
    this.httpCall.merge(params).subscribe((res:any)=>{
      this.shouldUpload = res.shouldUpload;
      this.uploadedList = res.uploadedList;
      this.msg.success("秒传：上传成功");
      this.status = this.Status.wait;
    })
  }

  // 用闭包保存每个 chunk 的进度数据
  createProgressHandler(item) {
    return e => {
      item.percentage = parseInt(String((e.loaded / e.total) * 100));
    };
  }
}
