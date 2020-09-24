(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
        (global = global || self, global.Monitor = factory());
}(this, () => {
    'use strict'

    const global = this;

    // 上报的数据
    let reportResult = {
        reportUrl: '',
        projectName: '',
        timeout: '',
        maxSize: '',
        ajaxSuccessField: '',
        ajaxSuccessCode: '',
        customData: {},

        // 监控数据上报时间
        reportTime: '',
        userAgent: navigator.userAgent,

        // 性能相关的数据
        performance: {
            // 其他时间
            common: {
                // DNS解析时间
                dnsTime: '',
                // TCP建立连接时间
                tcpTime: '',
                // 白屏时间
                firstPaintTime: '',
                // dom渲染完成时间
                domReadyTime: '',
                // 页面onload时间
                loadFinshedTime: ''
            },
            // 超时的资源
            timeout: [],
            // 超大的资源
            maxSize: []
        },

        // ajax相关的数据，abort、error、timeout、http code不是200-400、接口响应时间大于config.timeout等等的请求
        ajax: [],

        // JS错误
        // window.addEventListener(‘error’)  通过事件events对象和target属性，获取到触发事件名称及DOM
        // window.addEventListener(“unhandledrejection”)  未捕获的错误，比如promise错误
        // document.addEventListener(‘click’)
        // 对console.error进行重写
        // Vue.config.errorHandler
        // Vue.config.warnHandler
        // 增加SourceMap，发现真正的错误位置，而不是编译及压缩后的

    };

    // navigator.sendBeacon只能发送少量数据，所以这里限制了一下
    const maxResponseLength = 1000;

    // performance
    const performance = global.performance || global.webkitPerformance || global.msPerformance || global.mozPerformance ||
        global.oPerformance;

    // 返回数据类型
    function getType(data) {
        return ({}).toString.call(data).replace(/\[object\s(\w+)\]/g, '$1');
    }

    // 格式化headers
    function formatHeaders(headers) {
        let arr = headers.split('\r\n');
        let result = {};
        arr.forEach(item => {
            let iitem = item.split(': ') || [];
            result[iitem[0]] = iitem[1];
        })
        return result;
    }

    // 格式化cookie
    function formatCookie(cookie) {
        let arr = cookie.split('; ') || [];
        let result = {};
        arr.forEach(item => {
            let iitem = item.split('=') || [];
            result[iitem[0]] = iitem[1];
        });
        return result;
    }



    // class Monitor
    class Monitor {
        constructor(config = {}) {
            // 上报地址
            this.reportUrl = config.reportUrl || 'http://localhost:8080/';
            // 监控的项目名称
            this.projectName = config.projectName || 'myProject';
            // 超时设置(包含请求超时、ajax超时等)，单位毫秒。请求时间超过此值的请求将上报
            this.timeout = config.timeout || 3000;
            // 大小设置，单位字节B。资源大小超过此值的请求将上报，这里是300K
            this.maxSize = config.maxSize || 300 * 1024;
            // 接口返回的code的字段名称
            this.ajaxSuccessField = config.ajaxSuccessField || '';
            // 某些公司接口http code一直返回200，而在response中提示错误。所以这里可以配置ajaxSuccessField和ajaxSuccessCode，如果response[ajaxSuccessField]不是ajaxSuccessCode配置的，这些接口将进行上报，如：
            //{
            //  "errno": 404,
            //  "errmsg": "接口不存在",
            //  "data": [],
            // }
            this.ajaxSuccessCode = config.ajaxSuccessCode || 0;

            // 用户自定义的其他的需要上报的数据
            this.customData = config.customData || {};
        }

        // init
        init() {
            if (!performance || !navigator.sendBeacon) {
                return;
            }

            let self = this;

            // config data
            reportResult.reportUrl = this.reportUrl;
            reportResult.projectName = this.projectName;
            reportResult.timeout = this.timeout + '(ms)';
            reportResult.maxSize = this.maxSize + '(B)';
            reportResult.ajaxSuccessField = this.ajaxSuccessField;
            reportResult.ajaxSuccessCode = this.ajaxSuccessCode;
            reportResult.customData = Object.assign({}, this.customData);


            // XMLHttpRequest劫持
            let originOpen = XMLHttpRequest.prototype.open;
            let originSend = XMLHttpRequest.prototype.send;
            let originSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
            XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
                // 获取请求的相关参数。这里的this代表的是XMLHttpRequest构造函数的实例对象，不是global
                this.ajaxObj = {
                    requestApi: 'XMLHttpRequest',
                    method,
                    url: url.match(/http(s)?:\/\//) ? url : (location.origin + url),
                    async,
                    user,
                    password,
                    requestHeaders: {},
                };

                // 执行原来的open
                originOpen.call(this, method, url, async, user, password);
            }
            XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
                this.ajaxObj.requestHeaders[header] = value;
                originSetRequestHeader.call(this, header, value);
            }
            XMLHttpRequest.prototype.send = function (data) {
                // 获取请求的数据
                if (getType(data) == 'FormData') {
                    this.ajaxObj.params = {};
                    for (let key of data) {
                        this.ajaxObj.params[key[0]] = key[1];
                    }
                } else {
                    try {
                        this.ajaxObj.params = data ? JSON.parse(data) : {};
                    } catch (err) {
                        this.ajaxObj.params = data || {};
                    }
                }

                // cookie
                this.ajaxObj.cookie = formatCookie(document.cookie);

                // response
                this.ajaxObj.response = {};


                // 实际场景，不应该是unload时上报，而是每个重要的异常发生时都应该立即上报（比如发短信、打电话等），比如ajax发生abort、error、timeout时，就应该立即上报。其他的不是很重要的异常，可以后面统一上报
                // abort
                this.addEventListener('abort', e => {
                    this.ajaxObj.responseHeaders = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    this.ajaxObj.errMsg = '接口abort';
                    reportResult.ajax.push(JSON.parse(JSON.stringify(this.ajaxObj)));
                }, false);
                // error
                this.addEventListener('error', e => {
                    this.ajaxObj.responseHeaders = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    this.ajaxObj.errMsg = '接口error';
                    reportResult.ajax.push(JSON.parse(JSON.stringify(this.ajaxObj)));
                }, false);
                // timeout
                this.addEventListener('timeout', e => {
                    this.ajaxObj.responseHeaders = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    this.ajaxObj.errMsg = '接口timeout';
                    reportResult.ajax.push(JSON.parse(JSON.stringify(this.ajaxObj)));
                }, false);
                // load
                this.addEventListener('load', e => {
                    this.ajaxObj.responseHeaders = formatHeaders(this.getAllResponseHeaders());
                    this.ajaxObj.httpCode = this.status;
                    if (this.readyState == XMLHttpRequest.DONE) {
                        // 成功时
                        if (this.status >= 200 && this.status < 400) {
                            // 获取时长
                            let duration = performance.getEntriesByName(this.responseURL)[0] ?
                                performance.getEntriesByName(this.responseURL)[0].duration : 0;

                            // 获取response。不是所有的response都能解析的，比如二进制数据，所以这里try catch
                            let response = {};
                            try {
                                response = this.responseText ? JSON.parse(this
                                    .responseText) : {};
                            } catch (err) {
                                response = {
                                    'canNotParse': this.responseText.toString()
                                };
                                console.warn(
                                    `${this.ajaxObj.url} => 请求成功，但response数据不是正确的JSON格式，无法解析，response为：${this.responseText}`
                                );
                            }

                            // 将超时的和返回数据不对的接口进行上报
                            if (duration > self.timeout || (self.ajaxSuccessField && response[
                                        self.ajaxSuccessField] !=
                                    self.ajaxSuccessCode)) {
                                // navigator.sendBeacon只能发送少量数据，所以这里限制了一下
                                if (JSON.stringify(response).length > maxResponseLength) {
                                    this.ajaxObj.response =
                                        `response数据太大，不进行上报，如有需要请查看业务代码确认response`;
                                } else {
                                    this.ajaxObj.response = response || {};
                                }
                            }


                            // 超过设置的超时时间时
                            if (duration > self.timeout) {
                                this.ajaxObj.errMsg =
                                    `接口成功返回，但是花费了${duration}ms，时间超过了设置的timeout：${self.timeout}ms`;
                                reportResult.ajax.push(JSON.parse(JSON.stringify(this.ajaxObj)));
                            }

                            // 某些公司接口http code一直返回200，而在response中提示错误。所以这里可以配置ajaxSuccessField和ajaxSuccessCode，如果response[ajaxSuccessField]不是ajaxSuccessCode配置的，这些接口将进行上报，如：
                            //{
                            //  "errno": 25005,
                            //  "errmsg": "接口不存在",
                            //  "data": [],
                            // }
                            if (self.ajaxSuccessField && response[self.ajaxSuccessField] !=
                                self.ajaxSuccessCode) {
                                this.ajaxObj.errMsg =
                                    `接口成功返回，但是不是正常的状态，其response.${self.ajaxSuccessField}不是${self.ajaxSuccessCode}`;
                                reportResult.ajax.push(JSON.parse(JSON.stringify(this.ajaxObj)));
                            }
                        }
                        // 失败时
                        else {
                            this.ajaxObj.errMsg = this.statusText ||
                                `接口成功返回，但是http code为${this.status}，不是200-400`;
                            reportResult.ajax.push(JSON.parse(JSON.stringify(this.ajaxObj)));
                        }
                    }
                }, false);

                originSend.call(this, data);
            }


            // 劫持fetch请求
            // 这种功能以前是使用 XMLHttpRequest 实现的。Fetch 提供了一个更理想的替代方案，可以很容易地被其他技术使用，例如  Service Workers
            let originFetch = global.fetch;
            global.fetch = (input, init = {}) => {
                let ajaxObj = {
                    requestApi: 'fetch',
                    method: init.method || 'get',
                    url: input,
                    async: true,
                    requestHeaders: init.headers,
                    params: init.body,
                    cookie: formatCookie(document.cookie),
                    response: {},
                    responseHeaders: {},
                    httpCode: '',
                    errMsg: ''
                };

                let beginTime = +new Date();

                // 利用AbortController终止fetch请求
                // let controller = '';
                // if(global.AbortController) {
                //     controller = new global.AbortController();
                //     let signal = controller.signal;
                //     init.signal = signal;
                // }

                return new Promise((resolve, reject) => {
                    let originFetchRes = originFetch(input, init);
                    originFetchRes.then(async res => {
                        // 获取responseHeaders。不能获取所有的headers
                        // 参考：https://stackoverflow.com/questions/43344819/reading-response-headers-with-fetch-api
                        res.headers.forEach((value, key) => {
                            ajaxObj.responseHeaders[key] = value;
                        });

                        // 克隆Response对象。否则劫持时，获取了responseText，用户使用fetch时，会报错：body stream already read。
                        // 参考：https://developer.mozilla.org/zh-CN/docs/Web/API/Response
                        let resCopy = res.clone();

                        // timeout
                        if (+new Date() - beginTime > self.timeout) {
                            // controller && controller.abort();
                            ajaxObj.errMsg =
                                `接口返回时间超过了设置的timeout：${self.timeout}ms`;
                            reportResult.ajax.push(JSON.parse(JSON.stringify(
                                ajaxObj)));
                        }

                        // httpCode
                        ajaxObj.httpCode = resCopy.status;

                        // responseText
                        // 可用的方法有：Body.arrayBuffer()、Body.blob()、Body.formData()、Body.json()、Body.text()
                        // 这里简单利用text，后面通过try catch
                        let responseText = await resCopy.text();

                        // 获取ajaxObj.response
                        try {
                            responseText = responseText ? JSON.parse(responseText) :
                                {};
                            ajaxObj.response = responseText;
                        } catch (err) {
                            ajaxObj.response = {
                                'canNotParse': responseText
                            };
                            console.warn(
                                `${ajaxObj.url} => 请求成功，但response数据不是正确的JSON格式，无法解析，response为：${responseText}`
                            );
                        }

                        // navigator.sendBeacon只能发送少量数据，所以这里限制了一下
                        if (JSON.stringify(ajaxObj.response).length >
                            maxResponseLength) {
                            ajaxObj.response =
                                `response数据太大，不进行上报，如有需要请查看业务代码确认response`;
                        }

                        // 当接收到一个代表错误的 HTTP 状态码时，从 fetch() 返回的 Promise 不会被标记为 reject， 即使响应的HTTP状态码是 404 或 500。相反，它会将 Promise 状态标记为 resolve （但是会将 resolve的返回值的 ok 属性设置为 false ），仅当网络故障时或请求被阻止时，才会标记为 reject
                        if (resCopy.ok) {
                            // 某些公司接口http code一直返回200，而在response中提示错误。所以这里可以配置ajaxSuccessField和ajaxSuccessCode，如果response[ajaxSuccessField]不是ajaxSuccessCode配置的，这些接口将进行上报，如：
                            // {
                            //  "errno": 25005,
                            //  "errmsg": "接口不存在",
                            //  "data": [],
                            // }
                            if (self.ajaxSuccessField && responseText[self.ajaxSuccessField] !=
                                self.ajaxSuccessCode) {
                                ajaxObj.errMsg =
                                    `接口成功返回，但是不是正常的状态，其response.${self.ajaxSuccessField}不是${self.ajaxSuccessCode}`;
                                reportResult.ajax.push(JSON.parse(JSON.stringify(
                                    ajaxObj)));
                            }
                        } else {
                            ajaxObj.errMsg =
                                `接口返回成功，但是其http code为${ajaxObj.httpCode}，不是正确的http code`;
                            reportResult.ajax.push(JSON.parse(JSON.stringify(
                                ajaxObj)));
                        }

                        return resolve(res);
                    });
                    originFetchRes.catch(err => {
                        ajaxObj.response = err;
                        ajaxObj.httpCode = 'Failed';
                        ajaxObj.errMsg = `接口error`;
                        reportResult.ajax.push(JSON.parse(JSON.stringify(ajaxObj)));
                        return reject(err);
                    })
                })
            }


            // unloadCbk
            // performance.timing一般都是放在onload事件之后，我们这里直接放在unload之后
            // performance.getEntries之所以放在unloadCbk里面，是因为performance.getEntries会随着页面的交互而逐渐增加，放在unloadCbk外面只能获取初始化的请求
            let unloadCbk = () => {
                // 获取performance.common
                let timing = performance.timing;
                reportResult.performance.common.dnsTime = timing.domainLookupEnd - timing.domainLookupStart +
                    ' ms';
                reportResult.performance.common.tcpTime = timing.connectEnd - timing.connectStart +
                    ' ms';
                reportResult.performance.common.firstPaintTime = timing.responseStart - timing.requestStart +
                    ' ms';
                reportResult.performance.common.domReadyTime = timing.domContentLoadedEventEnd - timing
                    .navigationStart +
                    ' ms';
                reportResult.performance.common.loadFinshedTime = timing.loadEventEnd - timing.navigationStart +
                    ' ms';

                // 获取performance.timeout和performance.maxSize
                let requestList = performance.getEntries() || [];
                requestList.forEach(item => {
                    if (item.duration > this.timeout) {
                        reportResult.performance.timeout.push({
                            name: item.name,
                            duration: item.duration + ' ms',
                        })
                    }
                    if (item.decodedBodySize > this.maxSize) {
                        reportResult.performance.maxSize.push({
                            name: item.name,
                            // transferSize 表示资源传输总大小，包含header
                            // encodedBodySize 表示压缩之后的body大小
                            // decodedBodySize 表示解压之后的body大小
                            size: item.decodedBodySize + ' B'
                        })
                    }
                });



                // 上报
                // 一次性上传批量数据时，必然遇到数据量大，浪费流量，或者传输慢等情况，网络不好的状态下，可能导致上报失败。因此，在上报之前进行数据压缩也是一种方案。
                // 对于合并上报这种情况，一次的数据量可能要十几k，对于日 pv 大的站点来说，产生的流量还是很可观的。所以有必要对数据进行压缩上报。lz-string是一个非常优秀的字符串压缩类库，兼容性好，代码量少，压缩比高，压缩时间短，压缩率达到惊人的60%。但它基于LZ78压缩，如果后端不支持解压，可选择gzip压缩，一般而言后端会默认预装gzip，因此，选择gzip压缩数据也可以，工具包pako中自带了gzip压缩，可以尝试使用。

                // 实际场景，不应该是unload时上报，而是每个重要的异常发生时都应该立即上报，比如ajax发生abort、error、timeout时，就应该立即上报（比如发短信、打电话等）。其他的不是很重要的异常，可以后面统一上报
                reportResult.reportTime = new Date().toLocaleString();
                try {
                    reportResult = JSON.stringify(reportResult, null, '\t');

                    // navigator.sendBeacon只能发送少量数据，超过限制后将返回false
                    let isReportSuccess = navigator.sendBeacon(this.reportUrl, reportResult);
                    !isReportSuccess && console.error('上报失败，请检查上报数据大小');
                } catch (err) {
                    console.error('上报出错');
                }
            }

            // unload监听。利用navigator.sendBeacon一个页面只需要上报一次，就算浏览器关闭后，navigator.sendBeacon也能发送消息进行上报
            global.addEventListener('unload', unloadCbk, false);
        }
    }

    return Monitor;
}))