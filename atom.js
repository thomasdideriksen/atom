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
    
    readZeroTerminatedString: function() {
        var result = ''
        while (true) {
            var c = this.read8u();
            if (c == 0) {
                break;
            }
            result += String.fromCharCode(c);
        }
        return result;
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
    this._data = data;
    this._decode();
    this._map = this._buildMap();
}

ATOM.ParseResult.prototype = {
    
    get: function(address) {
        var arr = address.split('.');
        var map = this._map;
        for (var i = 0; i < arr.length; i++) {
            if (!map) {
                return null;
            }
            map = map[arr[i]];
        }
        return map;
    },
    
    enumerate: function(callback) {
        var stack = [];
        for (var i = this._data.children.length - 1; i >= 0; i--) {
            stack.push({data: this._data.children[i], level: 0});
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
    
    _buildMap: function() {
        var map = {};
        var stack = [];
        stack.push({children: this._data.children, map: map});
        while (stack.length > 0) {
            var entry = stack.pop();
            for (var i = 0; i < entry.children.length; i++) {
                var child = entry.children[i]; 
                var newMap = {}
                
                if (child.children && child.children.length > 0) {
                    stack.push({children: child.children, map: newMap});
                } else if (child.payload) {
                    newMap = child.payload;
                }
                
                if (child.name in entry.map) {
                    entry.map[child.name + '[0]'] = entry.map[child.name];
                    delete entry.map[child.name];
                    entry.map[child.name + '[1]'] = newMap
                }
                else if (child.name + '[1]' in entry.map) {
                    var idx = 2;
                    while (child.name + '[' + idx + ']' in entry.map) {
                        idx++;
                    }
                    entry.map[child.name + '[' + idx + ']'] = newMap;
                } 
                else {
                    entry.map[child.name] = newMap
                }
            }
        }
        return map;
    },
    
    _decode: function() {
        var that = this;
        this.enumerate(function(name, payload) {
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
                    } 
                    switch (prop.encoding) {
                        case 'date':
                            prop.decodedValue = that._decodeDate(prop.value);
                            break;
                        case 'fixed32':
                            prop.decodedValue = that._decodeFixedPoint(prop.value, 16);
                            break;
                        case 'fixed16':
                            prop.decodedValue = that._decodeFixedPoint(prop.value, 8);
                            break;
                        case 'code':
                            prop.decodedValue = ATOM.typeToString(prop.value);
                            break;
                        case 'matrix':
                            prop.decodedValue = that._decodeMatrix(prop.value);
                            break;
                    }
                    delete prop.encoding;
                }
            }
        });
    },
    
    _decodeDate: function(rawValue) {
        var movEpochSeconds = Date.UTC(1904, 0, 1, 0, 0 ,0, 0) / 1000.0;
        var valueSeconds = movEpochSeconds + rawValue;
        return new Date(valueSeconds * 1000.0);
    },
     
    _decodeFixedPoint: function(rawValue, shift) {
        return rawValue / (1 << shift);
    },
    
    _decodeMatrix: function(rawValue) {
        var scale1 = 1.0 / (1 << 16);
        var scale2 = 1.0 / (1 << 30);
        return [
            [rawValue[0] * scale1, rawValue[1] * scale1, rawValue[2] * scale2],
            [rawValue[3] * scale1, rawValue[4] * scale1, rawValue[5] * scale2],
            [rawValue[6] * scale1, rawValue[7] * scale1, rawValue[8] * scale2]];   
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
        ftyp: [
            'majorBrand        #t:32u,enc:code',
            'minorVersion      #t:32u',
            'compatibleBrands  #t:{ftypCompatibleBrand},c:([payloadSize] - 8) / 4',
        ],
        ftypCompatibleBrand: [
            'compatibleBrand:  #t:32u,enc:code',
        ],
        mvhd: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'creationTime      #t:32u,enc:date',
            'modificationTime  #t:32u,enc:date',
            'timeScale         #t:32u',
            'duration          #t:32u',
            'preferredRate     #t:32u,enc:fixed32',
            'preferredVolume   #t:16u,enc:fixed16',
            '                  #t:8u,c:10,e:0',
            'matrixStructure   #t:32u,c:9,enc:matrix',
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
            'creationTime      #t:32u,enc:date',
            'modificationTime  #t:32u,enc:date',
            'trackId           #t:32u',
            '                  #t:8u,c:4,e:0',
            'duration          #t:32u',
            '                  #t:8u,c:8,e:0',
            'layer             #t:16u',
            'alternateGroup    #t:16u',
            'volume            #t:16u,enc:fixed16',
            '                  #t:8u,c:2,e:0',
            'matrixStructure   #t:32u,c:9,enc:matrix',
            'trackWidth        #t:32u,enc:fixed32',
            'trackHeight       #t:32u,enc:fixed32',
        ],
        mdhd: [
            'version           #t:8u,e:0,b:abort',
            'flags             #t:8u,c:3',
            'creationTime      #t:32u,enc:date',
            'modificationTime  #t:32u,enc:date',
            'timeScale         #t:32u',
            'duration          #t:32u',
            'language          #t:16u',
            'quality           #t:16u',
        ],
        hdlr: [
            'version               #t:8u,e:0,b:abort',
            'flags                 #t:8u,c:3',
            'componentType         #t:32u,enc:code',
            'componentSubtype      #t:32u,enc:code',
            'componentManufacturer #t:32u',
            'componentFlags        #t:32u',
            'componentFlagsMask    #t:32u,e:0',
            'componentName         #t:PascalString', // Note: ZeroTerminatedString for MP4
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
            'width   #t:32u,enc:fixed32',
            'height  #t:32u,enc:fixed32',
        ],
        prof: [
            'version #t:8u,e:0,b:abort',
            'flags   #t:8u,c:3',
            'width   #t:32u,enc:fixed32',
            'height  #t:32u,enc:fixed32',
        ],
        enof: [
            'version #t:8u,e:0,b:abort',
            'flags   #t:8u,c:3',
            'width   #t:32u,enc:fixed32',
            'height  #t:32u,enc:fixed32',
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
            'mediaRate     #t:32u,enc:fixed32',
        ],
        dref: [
            'version         #t:8u,e:0,b:abort',
            'flags           #t:8u,c:3',
            'numberOfEntries #t:32u',
            'dataReferences  #t:{drefDataReference},c:{numberOfEntries}',
        ],
        drefDataReference: [
            'size    #t:32u',
            'type    #t:32u,enc:code',
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
            'dataFormat         #t:32u,enc:code',
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
            'version                    #t:8u,e:0,b:abort',
            'flags                      #t:8u,c:3',
            'sampleDependencyFlagsTable #t:8u,c:[payloadSize] - 4',
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
            'sampleSizeTable   #t:32u,c:{numberOfEntries} * ({sampleSize} > 0 ? 1 : 0)',
        ],
        stco: [
            'version            #t:8u,e:0,b:abort',
            'flags              #t:8u,c:3',
            'numberOfEntries    #t:32u',
            'chunkOffsetTable   #t:32u,c:{numberOfEntries}',
        ],
        co64: [
            'version            #t:8u,e:0,b:abort',
            'flags              #t:8u,c:3',
            'numberOfEntries    #t:32u',
            'chunkOffsetTable   #t:64u,c:{numberOfEntries}',
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
        ctts: [
            'version                #t:8u,e:0,b:abort',
            'flags                  #t:8u,c:3',
            'numberOfEntries        #t:32u',
            'compositionOffsetTable #t:{compositionOffsetTableEntry},c:{numberOfEntries}',
        ],
        compositionOffsetTableEntry: [
            'sampleCount        #t:32u',
            'compositionOffset  #t:32u',
        ],
        /*iods: [
            'version                #t:8u,e:0,b:abort',
            'flags                  #t:8u,c:3',
            'tag                    #t:8u',
            'length                 #t:8u',
            'objectDescriptorId     #t:16u',
            'odProfileLevel         #t:8u',
            'sceneProfileLevel      #t:8u',
            'audioProfileId         #t:8u',
            'videoProfileId         #t:8u',
            'graphicsProfileLevel   #t:8u',
        ],*/
        
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
        'udta',
    ],
    
    parse: function() {
        var data = this._parseGeneric(
            this.MOV_CONTAINER_ATOMS,
            this.MOV_PAYLOAD_TEMPLATES);
        return new ATOM.ParseResult(data);
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
            if (byteSize == 0) {
                console.warn('Ignoring zero box size (or possibly legacy "udta" terminator)')
                continue;
            }
            
            ATOM.IF_FALSE_THROW(byteSize >= 8, 'Atom size is too small (' + byteSize + ')');
            
            if (context.offset + byteSize < context.byteSize) {
                stack.push({origin: context.origin, offset: context.offset + byteSize, byteSize: context.byteSize, children: context.children});
            } 
            
            var type = reader.read32u();
            var typeName = ATOM.typeToString(type);
            
            var child = { name: typeName, type: type, byteSize: byteSize, children: [], byteOffset: context.origin + context.offset };
            context.children.push(child);
            
            if (containerSet.has(typeName)) {
                stack.push({ origin: reader.position(), offset: 0, byteSize: byteSize - 8, children: child.children, parentType: typeName});
            } 
            else if (typeName in payloadTemplates) {
                child.payload = this._parsePayload(payloadTemplates, typeName, byteSize - 8);
            } else {
                console.warn('Unknown box type: ' + typeName);
            }
        }
        
        return result;
    },
    
    _parsePayload: function(templates, templateId, byteSize) {
        
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
            var hasCount = false;
            var fieldData = {'count': 1, 'behavior': 'throw'}
            for (var j = 0; j < props.length; j++) {
                
                var re = /(.+?):(.+)/g
                var match = re.exec(props[j]);
                var key = match[1].trim();
                var value = match[2].trim();
                
                switch (key) {
                    case 't': fieldData['type'] = value; break;
                    case 'c': fieldData['count'] = value; hasCount = true; break;
                    case 'e': fieldData['expected'] = value; break;
                    case 'b': fieldData['behavior'] = value; break;
                    case 'enc': fieldData['encoding'] = value; break;
                }
            }
            
            // Evalute count
            var countField = fieldData['count'];
            var countFieldOriginal = countField;
            var re = /{(.+?)}/g
            var match;
            while ((match = re.exec(countFieldOriginal)) !== null) {
                countField = countField.replace(match[0], result[match[1]].value);
            }
            var re = /\[(.+?)\]/g
            var constants = {'payloadSize': byteSize}
            while ((match = re.exec(countField)) !== null) {
                countField = countField.replace(match[0], constants[match[1]]);
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
                result[name].value = (values.length > 1 || hasCount) ? values : values[0];
                result[name].encoding = fieldData['encoding'];
            }
        }
        
        return result;
    },
}

