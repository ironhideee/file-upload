import { HttpClient, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class HttpService {

  constructor(
    private http: HttpClient, 
  ) { }

  callhttp(url,params){
    const headers = new HttpHeaders().set('Content-Type', 'application/json')
    return this.http.post(url, params, {headers: headers});
  }

  callhttpfile(url,params){
    return this.http.post(url, params,{reportProgress: true});
  }

  verify(params){
    return this.callhttp("http://localhost:3000/verify",params);
  }

  merge(params){
    return this.callhttp("http://localhost:3000/merge",params);
  }

  upload(params){
    return this.callhttpfile("http://localhost:3000",params);
  }

}
