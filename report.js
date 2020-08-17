const http = require('http');
const fs = require('fs')
const path = require('path');
const url = require('url');
const { Transform } = require('stream');
const port = '8080';
const maxByte = 16 * 1024;  // 16KB


let size = 0;
let blocks = 0;
let num = 0;

class myTransform extends Transform {
	constructor(options) {
	    super(options);
  	}
  	_transform(chunk, encode, cb) {
		num++;

		// indexArr：获取头信息的位置，用于后面的buffer的slice
		let indexArr = []
		for (let i = 0; i < chunk.length; i++) {
			let r = chunk[i];
			let n = chunk[i + 1];
			if (r == 13 && n == 10) {
				indexArr.push(i)
			}
		}

		let fileData;
		if (size <= maxByte) {
			fileData = chunk.slice(indexArr[3] + 2, indexArr[indexArr.length - 2]);
		}
		else {
			// 第一块数据
			if (num == 1) {
				fileData = chunk.slice(indexArr[3] + 2);
			} else {
				// 其他块数据
				if (num < blocks) {
					fileData = chunk;
				}
				// 最后一块
				else {
					fileData = chunk.slice(0, indexArr[indexArr.length - 2]);
				}
			}
		}

		this.push(fileData);
		cb();
  	}
}


http.createServer((req, res) => {
	let reqUrl = url.parse(req.url, true);

	let filename = 'report.json';
	
	size = 512 * 1024;
	blocks = ~~(size / maxByte);
	num = 0;

	// 写入文件
	let filepath = path.resolve('./file') + '/';

	// 跨域，这里直接设置为*，实际场景应该只设置为我们的域名，不知道域名时可以根据origin设置CORS
	res.writeHead(200, {
		"Access-Control-Allow-Origin": "*"
	});

	if (req.method == 'OPTIONS') {
		return res.end('success');
	}

	let ts = new myTransform();
	let ws = fs.createWriteStream(filepath + filename);

	req.pipe(ts).pipe(ws);

	res.end(`{"path":"${filepath}${filename}"}`);
}).listen(port, '0.0.0.0', () => {
	console.log(`Server has started on port ${port} at ${new Date().toLocaleString()}`);
});