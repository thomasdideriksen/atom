'use strict'

var ATOM = {}

ATOM.ENDIAN_LITTLE = 0;
ATOM.ENDIAN_BIG = 1;

ATOM.Reader = function(buffer, endian) {
    this._view = new DataView(buffer);
    this._pos = 0;
    this.setEndian(endian);
}

ATOM.Reader.prototype = {
    
    setEndian: function(endian) {
        this._littleEndian = (endian == ATOM.ENDIAN_LITTLE);
    },
    
    seek: function(position) {
        this._pos = position;
    },
    
    size: function() {
        return this._view.buffer.byteLength;
    },
    
    position: function() {
        return this._pos;
    },
    
    read8u: function() {
        var val = this._view.getUint8(this._pos);
        this._pos += 1;
        return val;
    },
    
    read16u: function() {
        var val = this._view.getUint16(this._pos, this._littleEndian);
        this._pos += 2;
        return val;
    },
    
    read32u: function() {
        var val = this._view.getUint32(this._pos, this._littleEndian);
        this._pos += 4;
        return val;
    },
    
    readPascalString: function() {
        var length = this.read8u();
        var result = '';
        for (var i = 0; i < length; i++) {
            result += String.fromCharCode(this.read8u());
        }
        return result;
    },
}

ATOM.ParseResult = function(data) {
    this.data = data;
}

ATOM.ParseResult.prototype = {
    
    enumerate: function(callback) {
        var stack = [];
        for (var i = this.data.children.length - 1; i >= 0; i--) {
            stack.push({data: this.data.children[i], level: 0});
        }
        while (stack.length > 0) {
            var entry = stack.pop();
            callback(entry.data.name, entry.data.payload, entry.level);
            if (entry.data.children) {
                for (var i = entry.data.children.length - 1; i >= 0; i--) {
                    var item = entry.data.children[i];
                    stack.push({data: item, level: entry.level + 1});
                }
            }
        }
    },
}

ATOM.IF_FALSE_THROW = function(expr, msg) {
    if (expr == false) {
        throw msg;
    }
}

ATOM.stringToType = function(str) {
    ATOM.IF_FALSE_THROW(str.length == 4, 'Invalid type name length');
    var view = new DataView(new ArrayBuffer(4));
    for (var i = 0; i < 4; i++) {
        view.setUint8(i, str.charCodeAt(i));
    }
    return view.getUint32(0, false);
}

ATOM.typeToString = function(type) {
    var view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, type, false);
    return String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3));
}

ATOM.VAL_TYPE_NONE      = 0;
ATOM.VAL_TYPE_FIXED8    = 1;
ATOM.VAL_TYPE_FIXED16   = 2;
ATOM.VAL_TYPE_DATETIME  = 3;
ATOM.VAL_TYPE_TIME      = 4;
ATOM.VAL_TYPE_MATRIX    = 5;

ATOM.Parser = function(buffer) {
    this._reader = new ATOM.Reader(buffer, ATOM.ENDIAN_BIG);
}

ATOM.Parser.prototype = {
    
    MOV_PAYLOAD_TEMPLATES: {
         mvhd: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'creationTime      #t:32u,i:date',
            'modificationTime  #t:32u,i:date',
            'timeScale         #t:32u',
            'duration          #t:32u',
            'preferredRate     #t:32u,i:fixed32',
            'preferredVolume   #t:16u,i:fixed16',
            '                  #t:8u,c:10,e:0',
            'matrixStructure   #t:32u,c:9,i:matrix',
            'previewTime       #t:32u',
            'previewDuration   #t:32u',
            'posterTime        #t:32u',
            'selectionTime     #t:32u',
            'selctionDuration  #t:32u',
            'currentTime       #t:32u',
            'nextTrackId       #t:32u',
        ],
        tkhd: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'creationTime      #t:32u,i:date',
            'modificationTime  #t:32u,i:date',
            'trackId           #t:32u',
            '                  #t:8u,c:4,e:0',
            'duration          #t:32u',
            '                  #t:8u,c:8,e:0',
            'layer             #t:16u',
            'alternateGroup    #t:16u',
            'volume            #t:16u,i:fixed16',
            '                  #t:8u,c:2,e:0',
            'matrixStructure   #t:32u,c:9,i:matrix',
            'trackWidth        #t:32u,i:fixed32',
            'trackHeight       #t:32u,i:fixed32',
        ],
        mdhd: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'creationTime      #t:32u,i:date',
            'modificationTime  #t:32u,i:date',
            'timeScale         #t:32u',
            'duration          #t:32u',
            'language          #t:16u',
            'quality           #t:16u',
        ],
        hdlr: [
            'version               #t:8u,e:0,b:abort',
            'flags                 #t:8u,c:3',
            'componentType         #t:32u,i:code',
            'componentSubtype      #t:32u,i:code',
            'componentManufacturer #t:32u',
            'componentFlags        #t:32u',
            'componentFlagsMask    #t:32u,e:0',
            'componentName         #t:PascalString',
        ],
        vmhd: [
            'version      #t:8u,e:0,b:abort',
            'flags        #t:8u,c:3',
            'graphicsMode #t:16u',
            'opcolor      #t:16u,c:3',
        ],
        clef: [
            'version #t:8u,e:0,b:abort',
            'flags   #t:8u,c:3',
            'width   #t:32u,i:fixed32',
            'height  #t:32u,i:fixed32',
        ],
        prof: [
            'version #t:8u,e:0,b:abort',
            'flags   #t:8u,c:3',
            'width   #t:32u,i:fixed32',
            'height  #t:32u,i:fixed32',
        ],
        enof: [
            'version #t:8u,e:0,b:abort',
            'flags   #t:8u,c:3',
            'width   #t:32u,i:fixed32',
            'height  #t:32u,i:fixed32',
        ],
        elst: [
            'version         #t:8u,e:0,b:abort',
            'flags           #t:8u,c:3',
            'numberOfEntries #t:32u',
            'editListTable   #t:{elstEditList},c:{numberOfEntries}',
            
        ],
        elstEditList : [
            'trackDuration #t:32u',
            'mediaTime     #t:32u',
            'mediaRate     #t:32u,i:fixed32',
        ],
        dref: [
            'version         #t:8u,e:0,b:abort',
            'flags           #t:8u,c:3',
            'numberOfEntries #t:32u',
            'dataReferences  #t:{drefDataReference},c:{numberOfEntries}',
        ],
        drefDataReference: [
            'size    #t:32u',
            'type    #t:32u,i:code',
            'version #t:8u',
            'flags   #t:8u,c:3',
            'data    #t:8u,c:{size} - 12',
        ],
        stsd: [
            'version                #t:8u,e:0,b:abort',
            'flags                  #t:8u,c:3',
            'numberOfEntries        #t:32u',
            'sampleDescriptionTable #t:{stsdSampleDescription},c:{numberOfEntries}',
            
        ],
        stsdSampleDescription: [
            'size               #t:32u',
            'dataFormat         #t:32u',
            '                   #t:8u,c:6,e:0',
            'dataReferenceIndex #t:16u',
            'additionalData     #t:8u,c:{size} - 16',
        ],
        stts: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'numberOfEntries   #t:32u',
            'timeToSampleTable #t:{sttsTimeToSample},c:{numberOfEntries}',
        ],
        sttsTimeToSample: [
            'sampleCount    #t:32u',
            'sampleDuration #t:32u',
        ],
        stss: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'numberOfEntries   #t:32u',
            'syncSampleTable   #t:32u,c:{numberOfEntries}',
        ],
        sdtp: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            // TODO
        ],
        stsc: [
            'version            #t:8u,e:0,b:abort',
            'flags              #t:8u,c:3',
            'numberOfEntries    #t:32u',
            'sampleToChunkTable #t:{stscSampleToChunk},c:{numberOfEntries}',
        ],
        stscSampleToChunk: [
            'firstChunk          #t:32u',
            'samplesPerChunk     #t:32u',
            'sampleDescriptionId #t:32u',
        ],
        stsz: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'sampleSize        #t:32u',
            'numberOfEntries   #t:32u',
            'sampleSizeTable   #t:32u,c:{numberOfEntries}',
        ],
        stco: [
            'version            #t:8u,e:0,b:abort',
            'flags              #t:8u,c:3',
            'numberOfEntries    #t:32u',
            'chunkOffsetTable   #t:32u,c:{numberOfEntries}',
        ],
        smhd: [
            'version #t:8u,e:0,b:abort',
            'flags   #t:8u,c:3',
            'balance #t:16u',
            '        #t:16u,e:0',
        ],
        gmin: [
            'version        #t:8u,e:0,b:abort',
            'flags          #t:8u,c:3',
            'graphicsMode   #t:16u',
            'opcolor        #t:16u,c:3',
            'balance        #t:16u',
            '               #t:16u,e:0',
        ],
    },
    
    MOV_CONTAINER_ATOMS: [
        'moov',
        'trak',
        'tapt',
        'meta',
        'tapt',
        'edts',
        'tref',
        'mdia',
        'minf',
        'dinf',
        'stbl',
        'gmhd',
    ],
    
    parse: function() {
        var data = this._parseGeneric(
            this.MOV_CONTAINER_ATOMS,
            this.MOV_PAYLOAD_TEMPLATES);
        var result = new ATOM.ParseResult(data);
        var that = this;
        result.enumerate(function(name, payload) {
            var stack = [];
            stack.push(payload);
            while (stack.length > 0) {
                var obj = stack.pop();
                for (var propName in obj) {
                    var prop = obj[propName];
                    if (Array.isArray(prop.value)) {
                        for (var i = 0; i < prop.value.length; i++) {
                            if (typeof prop.value[i] === 'object') {
                                stack.push(prop.value[i]);
                            }
                        }
                    } else {
                        switch (prop.interpretation) {
                            case 'date':
                                prop.interpretedValue = that._interpretDate(prop.value);
                                break;
                            case 'fixed32':
                                prop.interpretedValue = that._interpretFixedPoint(prop.value, 16);
                                break;
                            case 'fixed16':
                                prop.interpretedValue = that._interpretFixedPoint(prop.value, 8);
                                break;
                            case 'code':
                                prop.interpretedValue = ATOM.typeToString(prop.value);
                                break;
                            case 'matrix':
                                prop.interpretedValue = that._interpretMatrix(prop.value);
                                break;
                        }
                    }
                    delete prop.interpretation;
                }
            }
        });
        
        return result;
    },
    
    _interpretDate: function(rawValue) {
        var movEpochSeconds = Date.UTC(1904, 0, 1, 0, 0 ,0, 0) / 1000.0;
        var valueSeconds = movEpochSeconds + rawValue;
        return new Date(valueSeconds * 1000.0);
    },
     
    _interpretFixedPoint: function(rawValue, shift) {
        return rawValue / (1 << shift);
    },
    
    _interpretMatrix: function(rawValue) {
        var scale1 = 1.0 / (1 << 16);
        var scale2 = 1.0 / (1 << 30);
        return [
            [rawValue[0] * scale1, rawValue[1] * scale1, rawValue[2] * scale2],
            [rawValue[3] * scale1, rawValue[4] * scale1, rawValue[5] * scale2],
            [rawValue[6] * scale1, rawValue[7] * scale1, rawValue[8] * scale2]];   
    },
    
    _parseGeneric: function(containers, payloadTemplates) {
        
        var reader = this._reader;
        var containerSet = new Set(containers);
        var result = {children: []};
        var stack = [];
        
        stack.push({origin: 0, offset: 0, byteSize: reader.size(), children: result.children });
        
        while (stack.length > 0) {
            
            var context = stack.pop();
            reader.seek(context.origin + context.offset);
            
            var byteSize = reader.read32u();
            ATOM.IF_FALSE_THROW(byteSize >= 8, 'Atom size is too small');
            
            if (context.offset + byteSize < context.byteSize) {
                stack.push({origin: context.origin, offset: context.offset + byteSize, byteSize: context.byteSize, children: context.children});
            }
            
            var type = reader.read32u();
            var typeName = ATOM.typeToString(type);
            
            var child = { name: typeName, type: type, byteSize: byteSize, children: [] };
            context.children.push(child);
            
            if (containerSet.has(typeName)) {
                stack.push({ origin: reader.position(), offset: 0, byteSize: byteSize - 8, children: child.children});
            } 
            else if (typeName in payloadTemplates) {
                child.payload = this._parsePayload(payloadTemplates, typeName);
            }
        }
        
        return result;
    },
    
    _parsePayload: function(templates, templateId) {
        
        // Prepare variables
        var reader = this._reader;
        var template = templates[templateId];
        var result = {};
        
        // Loop through all fields in template
        for (var i = 0; i < template.length; i++) {
        
            // Get field
            var field = template[i].split('#');
            var name = field[0].trim();
            var props = field[1].trim().split(',');
            
            // Parse field data
            var fieldData = {'count': 1, 'behavior': 'throw'}
            for (var j = 0; j < props.length; j++) {
                
                var prop = props[j].split(':');
                var key = prop[0].trim();
                var value = prop[1].trim();
                
                switch (key) {
                    case 't': fieldData['type'] = value; break;
                    case 'c': fieldData['count'] = value; break;
                    case 'e': fieldData['expected'] = value; break;
                    case 'b': fieldData['behavior'] = value; break;
                    case 'i': fieldData['interpretation'] = value; break;
                }
            }
            
            // Evalute count
            var countField = fieldData['count'];
            var re = /{(.+?)}/g
            var match;
            while ((match = re.exec(countField)) !== null) {
                countField = countField.replace(match[0], result[match[1]].value);
            }
            var count = eval(countField);
            ATOM.IF_FALSE_THROW(Number.isNaN(count) == false && count >= 0, 'Invalid count: ' + countField);
            
            // Evaluate type
            var type = fieldData['type'];
            var match = /{(.+)}/g.exec(type);
            
            // Read data
            var values = [];
            for (var j = 0; j < count; j++) {
                
                // Evaluate value
                var value = match ? this._parsePayload(templates, match[1]) : reader['read' + type]();
                
                // Verify value
                var expected = fieldData['expected']
                if (expected && expected != value.toString()) {
                    // Value mismatch, apply desired error behavior
                    switch (fieldData['behavior']) {
                        case 'abort': return result;
                        case 'throw': throw 'Invalid value in ' + templateId + '::' + name + '[' + i + ']: ' + value.toString() + ', expected: ' + expected;
                    }
                }
                
                // Append value
                values.push(value);
            }
            
            // Assign data
            if (name.length > 0) {
                result[name] = {};
                result[name].value = (values.length > 1 || match) ? values : values[0]; // Note: Composite types should ALWAYS be in an array - even an array of size 1
                result[name].interpretation = fieldData['interpretation'];
            }
        }
        
        return result;
    },
}

