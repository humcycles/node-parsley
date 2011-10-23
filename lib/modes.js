exports.begin = function (buf, start, len) {
    this.emit('begin');
    this.mode = 'method';
    return 0;
};

exports.method = function (buf, start, len) {
    var req = this.request;
    if (req.method == null) req.method = '';
    
    for (var i = start; i < len; i++) {
        var c = String.fromCharCode(buf[i]);
        if (c === ' ') {
            this.mode = 'url';
            break;
        }
        else if (c === '\n') {
            return -1;
        }
        else {
            req.method += c.toUpperCase();
        }
    }
    return i;
};

exports.url = function (buf, start, len) {
    var req = this.request;
    for (var i = start; i < len; i++) {
        var c = String.fromCharCode(buf[i]);
        if (c === ' ') {
            this.mode = 'versionBegin';
            break;
        }
        else if (c === '\n') {
            return -1;
        }
        else {
            req.url += c;
        }
    }
    return i;
};

exports.versionBegin = function (buf, start, len) {
    var req = this.request;
    if (this._httpVersionPrelude === undefined) this._httpVersionPrelude = '';
    
    for (var i = start; i < len; i++) {
        var c = String.fromCharCode(buf[i]);
        if (c === '/') {
            if (this._httpVersionPrelude !== 'HTTP') {
                return -1
            }
            else {
                this.mode = 'version';
            }
        }
        else if (c === '\n') {
            return -1;
        }
        else {
            this._httpVersionPrelude += c;
        }
    }
    return i;
};

exports.version = function (buf, start, len) {
    var req = this.request;
    if (req.httpVersion == null) req.httpVersion = '';
    
    if (req.method == null) req.method = '';
    
    for (var i = start; i < len; i++) {
        var c = String.fromCharCode(buf[i]);
        if (c === ' ') {
            return -1;
        }
        else if (c === '\n') {
            req.httpVersion = req.httpVersion.trim();
            
            var major = req.httpVersionMajor = Math.floor(req.httpVersion);
            var minor =req.httpVersionMinor = Number(req.httpVersion) - major;
            if (isNaN(major) || isNaN(minor)) {
                return -1;
            }
            
            this.mode = 'headerField';
            break;
        }
        else {
            req.httpVersion += c;
        }
    }
    return i;
};

exports.headerField = function (buf, start, len) {
    var req = this.request;
    if (this._field === undefined) this._field = '';
    
    for (var i = start; i < len; i++) {
        var c = String.fromCharCode(buf[i]);
        if (c === ':') {
            this.mode = 'headerValue';
            break;
        }
        else if (c === '\n') {
            if (this._field === '' || this._field === '\r') {
                this.mode = 'body';
                normalizeHeaders.call(this, req);
                
                this.emit('headersComplete', req.headers);
                break;
            }
            else return -1;
        }
        else {
            this._field += c;
        }
    }
    return i;
};

exports.headerValue = function (buf, start, len) {
    var req = this.request;
    if (this._value === undefined) this._value = '';
    for (var i = start; i < len; i++) {
        var c = String.fromCharCode(buf[i]);
        if (c === '\n') {
            var field = this._field.trim().toLowerCase();
            var value = this._value.trim();
            switch (field) {
                case 'connection' :
                case 'transfer-encoding' :
                case 'expect' :
                    value = value.toLowerCase();
                    break;
            }
            
            this.request._addHeaderLine(field, value);
            this.mode = 'headerField';
            break;
        }
        else {
            this._value += c;
        }
    }
    return i;
};

function normalizeHeaders (req) {
    var clen = req.headers['content-length'];
    if (clen !== undefined) {
        req.headers['content-length'] = parseInt(clen);
    }
    
    this._expectContinue =
        req.headers['expect'] !== undefined
        && req.httpVersionMajor === 1
        && req.httpVersionMinor === 1
        && req.headers['expect'] === '100-continue'
    ;
    
    var ver = parseFloat(req.httpVersion);
    
    if (req.headers['transfer-encoding']) {
        this._useChunkedEncoding =
            req.headers['transfer-encoding'] === 'chunked';
    }
    else {
        this._useChunkedEncoding = ver >= 1.1;
    }
    
    if (req.headers['connection'] !== undefined) {
        this._shouldKeepAlive = req.headers['connection'] === 'keep-alive';
    }
    else {
        this._shouldKeepAlive = ver >= 1.1;
    }
}

exports.body = function (buf, start, len) {
    var req = this.request;
    
    var enc = req.headers['transfer-encoding'];
    if (req.method === 'POST' || req.method === 'PUT') {
        if (this._useChunkedEncoding) {
            this.mode = 'chunkBegin';
        }
        else if (this._expectContinue) {
            this.mode = 'body'; // for now
        }
        else if (req.headers['content-length'] !== undefined) {
            this._pendingBytes = req.headers['content-length'];
            this.mode = 'readLen';
        }
        else return -1;
    }
    else {
        this.emit('end')
        this.mode = this._shouldKeepAlive ? 'begin' : 'finished';
    }
    
    return start;
};

exports.finished = function (buf, start, len) {
    return -1;
};

exports.chunkBegin = function (buf, start, len) {
    // todo
    return -1;
};

exports.readLen = function (buf, start, len) {
    var read = 0;
    if (len <= this._pendingBytes) {
        if (start === 0) {
            this.emit('data', buf);
        }
        else {
            this.emit('data', buf.slice(start, len));
        }
        this._pendingBytes -= len;
        read = len;
    }
    else {
        this.emit('data', buf.slice(start, start + this._pendingBytes));
        read = this._pendingBytes;
        this._pendingBytes = 0;
    }
    
    if (this._pendingBytes === 0) {
        this.emit('end')
        this.mode = this._shouldKeepAlive ? 'begin' : 'finished';
    }
    
    return start + read;
};
