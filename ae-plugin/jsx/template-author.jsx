#include "../vendor/json2.jsx"

var VMixTemplateAuthor = (function () {
    var prefix = "VMIX ";
    var motionLayer = "VMIX MOTION";
    var pending = null, panelExport = null;
    var logoKeys = ["team.homeLogo", "team.awayLogo", "event.logo"];
    var names = ["主队队名", "客队队名", "主队比分", "客队比分", "比赛计时",
        "节目名称", "表演者", "节目副标题", "节目类型", "活动名称"];
    var keys = ["team.home", "team.away", "score.home", "score.away", "clock.match",
        "program.title", "program.performer", "program.subtitle", "program.type", "event.name"];
    var examples = ["主队名称", "客队名称", "0", "0", "00:00",
        "节目名称", "表演者", "节目副标题", "歌唱", "活动名称"];
    var samplePS = [[134, 0, 214, 60], [134, 60, 214, 60], [352, 0, 68, 60],
        [352, 60, 68, 60], [0, 60, 130, 60]];
    var psTeamColors = {
        "主队队色 · 队名": ["home", "#FF3300"], "主队队色 · 比分": ["home", "#FF3300"],
        "客队队色 · 队名": ["away", "#FCDD42"], "客队队色 · 比分": ["away", "#FCDD42"]
    };

    function fail(message) { throw new Error(message); }
    function pixel(value) { return Number(value.as("px")); }
    function round(value) { return Math.round(value * 1000) / 1000; }
    function within(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function field(layer) {
        for (var i = 0; i < keys.length; i++) if (layer.name === prefix + keys[i]) return i;
        return -1;
    }
    function widget(layer) {
        var tag = /^VMIX CARD (home|away) (#[0-9a-f]{6})$/i.exec(layer.name);
        if (tag) return { type: "rect", color: tag[2], colorField: tag[1] };
        tag = /^VMIX LOGO (team\.homeLogo|team\.awayLogo|event\.logo)$/.exec(layer.name);
        if (tag) return { type: "image", bind: tag[1] };
        return null;
    }
    function widgetBox(item, box, width, height, module) {
        if (module === "stage" && (item.colorField || item.bind !== "event.logo")) {
            fail("队色和队徽控件用于足球模板。");
        }
        var x = within(Math.round(box[0]), 0, width);
        var y = within(Math.round(box[1]), 0, height);
        var w = within(Math.round(box[0] + box[2]) - x, 0, width - x);
        var h = within(Math.round(box[1] + box[3]) - y, 0, height - y);
        if (!w || !h) fail("请将队色或 Logo 控件放回画布。");
        item.x = x; item.y = y; item.width = w; item.height = h;
        return item;
    }
    function rgb(channels) {
        var hex = "#", part;
        for (var i = 0; i < 3; i++) {
            part = Math.round(within(channels[i], 0, 1) * 255).toString(16);
            hex += part.length === 1 ? "0" + part : part;
        }
        return hex;
    }
    function fileData(file) {
        file.encoding = "BINARY";
        if (!file.open("r")) fail("无法读取素材 " + file.fsName);
        try {
            if (file.length > 1874900) fail("透明底图超过 1.78 MiB。请缩小作品尺寸或减少底图纹理。");
            return file.read();
        } finally { file.close(); }
    }
    function embedPng(file) {
        var input = fileData(file);
        var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        if (input.length < 24 || input.substr(1, 3) !== "PNG") fail("Adobe 没有生成有效的透明 PNG。");
        var output = [], chunk = "", a, b, c;
        for (var i = 0; i < input.length; i += 3) {
            a = input.charCodeAt(i); b = input.charCodeAt(i + 1) || 0; c = input.charCodeAt(i + 2) || 0;
            chunk += alphabet.charAt(a >> 2) + alphabet.charAt(((a & 3) << 4) | (b >> 4)) +
                (i + 1 < input.length ? alphabet.charAt(((b & 15) << 2) | (c >> 6)) : "=") +
                (i + 2 < input.length ? alphabet.charAt(c & 63) : "=");
            if (chunk.length >= 8192) { output.push(chunk); chunk = ""; }
        }
        output.push(chunk);
        return "data:image/png;base64," + output.join("");
    }
    function readJson(file) {
        file.encoding = "UTF-8";
        if (!file.open("r")) fail("无法打开已有模板。");
        var result;
        try {
            if (file.length > 4 * 1024 * 1024) fail("模板文件超过 4 MiB。");
            result = JSON.parse(file.read().replace(/^\uFEFF/, ""));
        } finally { file.close(); }
        return result;
    }
    function readTemplate(file, module) {
        var result = readJson(file);
        if (!result || result.format !== "vibe-vmix-graphics" || result.version !== 2 ||
            result.module !== module || !result.scene || !result.motion || !(result.elements instanceof Array)) {
            fail("请选择同一模块的 .vmix-graphics.json 模板。");
        }
        return result;
    }
    function readFootballPack(file) {
        var result = readJson(file);
        if (!result || result.format !== "vibe-vmix-football" || result.version !== 1) {
            fail("请选择已有的 .vmix-football.json 全局包装模板。");
        }
        return result;
    }
    function saveTemplate(file, template) {
        var data = JSON.stringify(template);
        if (data.length > 4000000) fail("模板超过 4 MiB。");
        file.encoding = "UTF-8";
        if (!file.open("w")) fail("无法写入文件。请检查保存位置及 Adobe 的脚本写入权限。");
        try {
            if (!file.write(data)) fail("写入模板失败 " + file.error);
        } finally { file.close(); }
        if (!file.exists || file.length < data.length) fail("模板未写完整。");
    }
    function addText(elements, i, box, style, width, height, module) {
        if ((module === "football") !== (i < 5)) fail("图层「" + names[i] + "」属于另一种模块。");
        var x = within(Math.round(box[0]), 0, width - 1);
        var y = within(Math.round(box[1]), 0, height - 1);
        if (box[2] <= 0 || box[3] <= 0 || box[0] >= width || box[1] >= height ||
            box[0] + box[2] <= 0 || box[1] + box[3] <= 0) fail("请将「" + names[i] + "」拖回画布。");
        var size = within(round(style.size), 8, 144);
        var font = String(style.family || "").replace(/^MicrosoftYaHei(?:-.*)?$/i, "Microsoft YaHei");
        if (!font || font.length > 64 || /[^A-Za-z0-9\u00C0-\uFFFF -]/.test(font)) font = "Microsoft YaHei";
        elements.push({
            type: "text", bind: keys[i], text: String(style.text || examples[i]).replace(/\s+/g, " ").substring(0, 160),
            x: x, y: y, width: within(Math.round(box[0] + box[2]) - x, 1, width - x),
            height: within(Math.round(box[1] + box[3]) - y, 1, height - y),
            font: font, fontSize: size, minFontSize: Math.max(8, Math.floor(size * 0.65)),
            align: style.align, weight: style.bold ? 700 : 400, color: style.color
        });
    }
    function pointBox(i, left, top, visibleWidth, visibleHeight, size, align, width) {
        var minimum = i === 2 || i === 3 ? size * 1.8 : i === 4 ? size * 3.8 :
            i === 8 ? size * 4 : Math.max(size * 6, width * 0.34);
        var boxWidth = Math.max(visibleWidth + 6, minimum);
        var shift = align === "center" ? (boxWidth - visibleWidth) / 2 :
            align === "right" ? (boxWidth - visibleWidth) : 0;
        var boxHeight = Math.max(visibleHeight + 8, size * 1.3);
        return [left - shift, top - (boxHeight - visibleHeight) / 2, boxWidth, boxHeight];
    }
    function psScene(doc, module, png, external) {
        var width = pixel(doc.width), height = pixel(doc.height), text = [], colors = [], logos = [], duplicate;
        sizeCheck(width, height);
        var sample = width === 420 && height === 120 && decodeURI(doc.name) === "BITFA动效比分条.psd";
        function visibleLayers(layers) {
            for (var i = layers.length - 1; i >= 0; i--) {
                var layer = layers[i], index = field(layer);
                if (!layer.visible) continue;
                if (layer.typename === "LayerSet") { visibleLayers(layer.layers); continue; }
                var bounds = layer.bounds;
                var x = pixel(bounds[0]), y = pixel(bounds[1]);
                var w = pixel(bounds[2]) - x, h = pixel(bounds[3]) - y;
                var team = psTeamColors[layer.name];
                var item = widget(layer);
                if (item) {
                    var control = widgetBox(item, [x,y,w,h], width, height, module);
                    (control.type === "rect" ? colors : logos).push(control);
                    layer.visible = false;
                } else if (sample && team instanceof Array && w > 0 && h > 0 &&
                    x >= 0 && y >= 0 && x + w <= width && y + h <= height) {
                    colors.push({ type: "rect", x: x, y: y, width: w, height: h, color: team[1], colorField: team[0] });
                    layer.visible = false;
                } else if (index >= 0) {
                    if (layer.kind !== LayerKind.TEXT) fail("「" + names[index] + "」必须是 Photoshop 文字图层。");
                    var item = layer.textItem;
                    var align = item.justification === Justification.CENTER ? "center" :
                        item.justification === Justification.RIGHT ? "right" : "left";
                    var size = pixel(item.size) * doc.resolution / 72;
                    var pos = item.position, c = item.color.rgb;
                    var box = item.kind === TextType.PARAGRAPHTEXT ?
                        [pixel(pos[0]), pixel(pos[1]), pixel(item.width), pixel(item.height)] :
                        pointBox(index, x, y, w, h, size, align, width);
                    if (sample && item.kind !== TextType.PARAGRAPHTEXT) {
                        var standard = samplePS[index];
                        var anchors = [[241, 43], [241, 103], [386, 44], [386, 104], [65, 101]];
                        if (standard) box = [standard[0] + pixel(pos[0]) - anchors[index][0],
                            standard[1] + pixel(pos[1]) - anchors[index][1], standard[2], standard[3]];
                    }
                    var font = app.fonts.getByName(item.font);
                    addText(text, index, box, { text: item.contents, size: size,
                        align: align, family: font.family, bold: item.fauxBold || /bold|black|heavy/i.test(font.style),
                        color: rgb([c.red / 255, c.green / 255, c.blue / 255]) }, width, height, module);
                    if (sample && index < 4) text[text.length - 1].inkField = index % 2 === 0 ? "home" : "away";
                    layer.visible = false;
                }
            }
        }
        try {
            duplicate = doc.duplicate();
            if (duplicate.mode !== DocumentMode.RGB) duplicate.changeMode(ChangeMode.RGB);
            if (duplicate.bitsPerChannel !== BitsPerChannelType.EIGHT) duplicate.bitsPerChannel = BitsPerChannelType.EIGHT;
            visibleLayers(duplicate.layers);
            checkFields(text.concat(colors, logos));
            duplicate.saveAs(png, new PNGSaveOptions(), true, Extension.LOWERCASE);
            return [plate(png, width, height, external)].concat(colors, logos, text);
        } finally {
            if (duplicate) duplicate.close(SaveOptions.DONOTSAVECHANGES);
            app.activeDocument = doc;
        }
    }
    function plate(file, width, height, external) {
        return { type: "image", x: 0, y: 0, width: width, height: height, src: external ? "" : embedPng(file) };
    }
    function sizeCheck(width, height) {
        if (width < 64 || width > 1920 || height < 24 || height > 1080) {
            fail("画布尺寸须在 64 × 24 至 1920 × 1080 像素之间。");
        }
    }
    function checkFields(fields) {
        if (!fields.length) fail("先添加一个实时字段。足球样品的 AE 合成可选用 PS 已导出的模板作为底图和文字来源。");
        if (fields.length > 63) fail("控件最多可添加 63 层。");
    }
    function transform(layer) { return layer.property("ADBE Transform Group"); }
    function prop(layer, name) { return transform(layer).property("ADBE " + name); }
    function stillTracks() {
        return {
            enter: { duration: 1, frames: [{ t: 0, x: 0, y: 0, opacity: 1 }, { t: 1, x: 0, y: 0, opacity: 1 }] },
            exit: { duration: 1, frames: [{ t: 0, x: 0, y: 0, opacity: 1 }, { t: 1, x: 0, y: 0, opacity: 0 }] }
        };
    }
    function aeMotion(comp) {
        var rig = comp.layer(motionLayer);
        if (!rig) return { tracks: stillTracks(), hold: within(comp.time, 0, comp.duration - comp.frameDuration) };
        if (rig.threeDLayer || rig.parent || prop(rig, "Position").dimensionsSeparated) {
            fail("动画控制层须为独立二维图层，位置维度保持合并。");
        }
        var position = prop(rig, "Position"), scale = prop(rig, "Scale");
        var angle = prop(rig, "Rotate Z"), opacity = prop(rig, "Opacity"), anchor = prop(rig, "Anchor Point");
        var properties = [position, scale, angle, opacity], times = [], marks = {}, i, j;
        for (i = 0; i < properties.length; i++) {
            for (j = 1; j <= properties[i].numKeys; j++) times.push(properties[i].keyTime(j));
        }
        for (i = 1; i <= comp.markerProperty.numKeys; i++) {
            marks[comp.markerProperty.keyValue(i).comment] = comp.markerProperty.keyTime(i);
        }
        function point(at, ratio) {
            var p = position.valueAtTime(at, false), s = scale.valueAtTime(at, false);
            return { t: ratio, x: round(p[0]), y: round(p[1]), sx: round(s[0] / 100),
                sy: round(s[1] / 100), rotation: round(angle.valueAtTime(at, false)),
                opacity: round(within(opacity.valueAtTime(at, false) / 100, 0, 1)) };
        }
        function neutral(at) {
            var p = point(at, 0);
            return p.x === 0 && p.y === 0 && p.sx === 1 && p.sy === 1 && p.rotation === 0 && p.opacity === 1;
        }
        var start = marks["VMIX IN"], hold = marks["VMIX HOLD"], out = marks["VMIX OUT"], end = marks["VMIX END"];
        times.sort(function (a, b) { return a - b; });
        if (start === undefined) start = times[0];
        if (end === undefined) end = times[times.length - 1];
        if (hold === undefined || out === undefined) {
            var longest = 0;
            for (i = 1; i < times.length; i++) {
                var span = times[i] - times[i - 1];
                if (times[i - 1] <= start || times[i] >= end || span <= longest) continue;
                if (neutral(times[i - 1]) && neutral(times[i]) && neutral((times[i - 1] + times[i]) / 2)) {
                    longest = span; hold = times[i - 1]; out = times[i];
                }
            }
        }
        if (!(start >= 0 && start < hold && hold <= out && out < end && end <= comp.duration) ||
            !neutral(hold) || !neutral(out)) {
            fail("请在停留段把动画控制层设为位置 0,0、缩放 100%、旋转 0°、不透明度 100%。可用 VMIX HOLD、VMIX OUT 标记指定停留段。");
        }
        var pivot = anchor.valueAtTime(hold, false);
        if (pivot[0] !== 0 || pivot[1] !== 0 || anchor.numKeys) fail("动画控制层的锚点须固定在 0,0。");
        function track(first, last) {
            var duration = Math.round((last - first) * 1000);
            if (duration < 1 || duration > 10000) fail("入场和退场需分别在 10 秒以内。");
            var count = within(Math.round((last - first) / comp.frameDuration), 1, 239), frames = [];
            for (var k = 0; k <= count; k++) {
                var p = point(first + (last - first) * k / count, k / count);
                if (Math.abs(p.x) > 1920 || Math.abs(p.y) > 1080 || p.sx < .05 || p.sx > 4 ||
                    p.sy < .05 || p.sy > 4 || Math.abs(p.rotation) > 360) fail("动画变换超出工作台的范围。");
                frames.push(p);
            }
            return { duration: duration, frames: frames };
        }
        return { tracks: { enter: track(start, hold), exit: track(out, end) }, hold: (hold + out) / 2 };
    }
    function aeScene(comp, module, hold, png, finish, external) {
        var text = [], colors = [], logos = [], fields = [], width = comp.width, height = comp.height;
        var i, layer, index;
        sizeCheck(width, height);
        for (i = comp.numLayers; i >= 1; i--) {
            layer = comp.layer(i); index = field(layer);
            var item = widget(layer);
            if ((index < 0 && !item) || !layer.enabled) continue;
            var source = layer.property("ADBE Text Properties");
            if (!item && !source) fail("「" + layer.name + "」必须是 AE 文字图层。");
            if (layer.threeDLayer || (layer.parent && layer.parent.name !== motionLayer) ||
                prop(layer, "Rotate Z").valueAtTime(hold, false) !== 0) {
                fail("「" + layer.name + "」须用二维、零旋转图层，可挂到 VMIX MOTION 控制层。");
            }
            var document = item ? null : source.property("ADBE Text Document").valueAtTime(hold, false);
            var bounds = layer.sourceRectAtTime(hold, document ? document.boxText : false);
            var p = prop(layer, "Position").valueAtTime(hold, false);
            var a = prop(layer, "Anchor Point").valueAtTime(hold, false);
            var s = prop(layer, "Scale").valueAtTime(hold, false);
            if (s[0] <= 0 || s[1] <= 0) fail("实时文字图层的缩放需大于零。");
            var x = p[0] + (bounds.left - a[0]) * s[0] / 100;
            var y = p[1] + (bounds.top - a[1]) * s[1] / 100;
            var boxWidth = bounds.width * s[0] / 100, boxHeight = bounds.height * s[1] / 100;
            if (item) {
                var control = widgetBox(item, [x,y,boxWidth,boxHeight], width, height, module);
                (control.type === "rect" ? colors : logos).push(control);
                fields.push(layer.index);
                continue;
            }
            item = document;
            var align = item.justification === ParagraphJustification.CENTER_JUSTIFY ? "center" :
                item.justification === ParagraphJustification.RIGHT_JUSTIFY ? "right" : "left";
            var size = item.fontSize * s[1] / 100;
            addText(text, index, item.boxText ? [x, y, boxWidth, boxHeight] :
                pointBox(index, x, y, boxWidth, boxHeight, size, align, width), {
                    text: item.text, size: size, family: item.fontFamily || item.font,
                    bold: item.fauxBold || /bold|black|heavy/i.test(item.fontStyle || ""),
                    align: align, color: item.applyFill ? rgb(item.fillColor) : "#FFFFFF"
                }, width, height, module);
            fields.push(layer.index);
        }
        checkFields(text.concat(colors, logos));
        if (pending) fail("AE 正在导出另一份模板，请等它完成。");
        var source = comp.duplicate();
        function removeCopy() { source.remove(); }
        try {
            for (i = 0; i < fields.length; i++) {
                var layerCopy = source.layer(fields[i]);
                layerCopy.locked = false;
                if (layerCopy.solo) layerCopy.solo = false;
                layerCopy.enabled = false;
            }
            source.resolutionFactor = [1, 1];
            source.saveFrameToPng(hold, png);
            // AE may finish writing the frame after the calling script has returned.
            pending = { file: png, length: 0, until: new Date().getTime() + 20000,
                complete: function (file, error) {
                    try {
                        removeCopy();
                        if (error) finish(null, error);
                        else finish([plate(file, width, height, external)].concat(colors, logos, text));
                    } catch (error) {
                        finish(null, error);
                    } finally { if (!external && file.exists) file.remove(); }
                }
            };
            app.scheduleTask("VMixTemplateAuthor.pollRender()", 175, false);
        } catch (error) {
            pending = null;
            removeCopy();
            throw error;
        }
    }
    function pollRender() {
        if (!pending) return;
        var job = pending, file = new File(job.file.fsName);
        if (file.exists && file.length > 0 && file.length === job.length) {
            pending = null;
            job.complete(file);
        } else if (new Date().getTime() >= job.until) {
            pending = null;
            job.complete(file, new Error("AE 未在 20 秒内生成透明底图，请检查合成能否正常渲染。"));
        } else {
            job.length = file.exists ? file.length : 0;
            app.scheduleTask("VMixTemplateAuthor.pollRender()", 175, false);
        }
    }
    function addField(isPS, source, index, planned) {
        var width = isPS ? pixel(source.width) : source.width;
        var height = isPS ? pixel(source.height) : source.height;
        var size = within(Math.round(height * 0.22), 14, 52);
        var boxWidth = Math.round(width * 0.49);
        var x = Math.round(width * 0.17), y = Math.round(height * 0.23);
        var boxHeight = Math.round(height * 0.5);
        var label = index >= 0 ? examples[index] : "自定义文字", layer;
        if (planned && index >= 0) {
            var layout = [[.33,.03,.48,.44,.22],[.33,.53,.48,.44,.22],
                [.825,.03,.16,.44,.24],[.825,.53,.16,.44,.24],[.025,.53,.28,.44,.23],
                [.18,.11,.78,.47,.28],[.18,.57,.78,.33,.19],[.18,.74,.78,.23,.16],
                [.018,.2,.14,.6,.16],[.18,.03,.78,.28,.18]][index];
            x = Math.round(width * layout[0]); y = Math.round(height * layout[1]);
            boxWidth = Math.max(2, Math.round(width * layout[2]));
            boxHeight = Math.max(2, Math.round(height * layout[3]));
            size = Math.max(8, Math.min(90, Math.round(height * layout[4])));
        }
        var center = planned && (index >= 0 && index < 5 || index === 8);
        if (isPS) {
            layer = source.artLayers.add();
            layer.kind = LayerKind.TEXT;
            var text = layer.textItem;
            text.kind = TextType.PARAGRAPHTEXT;
            text.position = [UnitValue(x, "px"), UnitValue(y, "px")];
            text.width = UnitValue(boxWidth, "px");
            text.height = UnitValue(boxHeight, "px");
            if (center) text.justification = Justification.CENTER;
            text.size = UnitValue(size * 72 / source.resolution, "pt");
            var color = new SolidColor();
            color.rgb.hexValue = "FFFFFF";
            text.color = color;
            text.contents = label;
        } else {
            layer = source.layers.addBoxText([boxWidth, boxHeight], label);
            var documentProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
            var item = documentProp.value;
            item.fontSize = size; item.applyFill = true; item.fillColor = [1, 1, 1];
            if (center) item.justification = ParagraphJustification.CENTER_JUSTIFY;
            documentProp.setValue(item);
            var rig = source.layer(motionLayer);
            if (rig) {
                layer.setParentWithJump(rig);
                prop(layer, "Opacity").expression = "value * parent.transform.opacity / 100";
            }
            var bounds = layer.sourceRectAtTime(source.time, true);
            var anchor = prop(layer, "Anchor Point").value;
            prop(layer, "Position").setValue([x - bounds.left + anchor[0], y - bounds.top + anchor[1]]);
        }
        layer.name = index >= 0 ? prefix + keys[index] : label;
        return layer;
    }
    function addWidget(isPS, source, control, previewColor) {
        var isCard = control === "home" || control === "away";
        var logoIndex = -1;
        for (var i = 0; i < logoKeys.length; i++) if (logoKeys[i] === control) logoIndex = i;
        if (!isCard && logoIndex < 0) fail("未知面板控件。");
        var shade = isCard ? previewColor : "#506782";
        if (typeof shade !== "string" || !/^#[0-9a-f]{6}$/i.test(shade)) fail("请选择一个有效的队伍颜色。");
        var width = isPS ? pixel(source.width) : source.width, height = isPS ? pixel(source.height) : source.height;
        var w = Math.round(width * .67), h = Math.round(height * .46);
        var x = Math.round(width * .31), y = Math.round(height * (control === "away" ? .52 : .02)), layer;
        if (!isCard) {
            w = Math.max(4, Math.round(Math.min(width * .12, height * .34))); h = w;
            x = Math.round(width * [ .028, .168, .025 ][logoIndex]);
            y = Math.round(height * (logoIndex === 2 ? .32 : .08));
        }
        if (isPS) {
            layer = source.artLayers.add();
            var color = new SolidColor();
            color.rgb.hexValue = shade.slice(1);
            source.selection.select([[x,y], [x+w,y], [x+w,y+h], [x,y+h]]);
            try { source.selection.fill(color); } finally { source.selection.deselect(); }
        } else {
            layer = source.layers.addShape();
            var root = layer.property("ADBE Root Vectors Group");
            var rect = root.addProperty("ADBE Vector Shape - Rect");
            rect.property("ADBE Vector Rect Size").setValue([w,h]);
            var fill = root.addProperty("ADBE Vector Graphic - Fill");
            fill.property("ADBE Vector Fill Color").setValue([parseInt(shade.slice(1,3),16)/255,
                parseInt(shade.slice(3,5),16)/255, parseInt(shade.slice(5,7),16)/255]);
            var rig = source.layer(motionLayer);
            if (rig) {
                layer.setParentWithJump(rig);
                prop(layer, "Opacity").expression = "value * parent.transform.opacity / 100";
            }
            prop(layer, "Position").setValue([x+w/2, y+h/2]);
        }
        layer.name = isCard ? "VMIX CARD " + control + " " + shade : "VMIX LOGO " + control;
    }
    function addRig(comp) {
        if (comp.layer(motionLayer)) fail("这个合成已有 VMIX MOTION。可以直接在时间轴上编辑。");
        if (comp.duration < 1.1) fail("将合成长度先设为 1.1 秒或更长。");
        var layers = [], i, l;
        for (i = 1; i <= comp.numLayers; i++) {
            l = comp.layer(i);
            if (!l.parent && l instanceof AVLayer && !l.threeDLayer && !l.locked) layers.push(l);
        }
        var rig = comp.layers.addNull(comp.duration);
        rig.name = motionLayer;
        prop(rig, "Anchor Point").setValue([0, 0]);
        prop(rig, "Position").setValue([0, 0]);
        for (i = 0; i < layers.length; i++) {
            l = layers[i]; l.parent = rig;
            var alpha = prop(l, "Opacity");
            if (!alpha.expressionEnabled) alpha.expression = "value * parent.transform.opacity / 100";
        }
        var end = Math.min(1.6, comp.duration - comp.frameDuration);
        var times = [0, 0.42, end - 0.3, end];
        prop(rig, "Position").setValuesAtTimes(times, [[-28, 0], [0, 0], [0, 0], [-18, 0]]);
        prop(rig, "Opacity").setValuesAtTimes(times, [0, 100, 100, 0]);
        comp.time = 0.6;
    }
    function exportFile(isPS, source, file, options, callback) {
        var module = options.module, width = isPS ? pixel(source.width) : source.width;
        var height = isPS ? pixel(source.height) : source.height;
        sizeCheck(width, height);
        if (!options.name.length || options.name.length > 64) fail("模板名称需为 1 至 64 个字符。");
        if (!/^[a-z][a-z0-9-]{0,47}$/.test(options.id) || /^(classic|prototype|constructor)$/.test(options.id)) {
            fail("模板标识需以小写英文字母开头，可包含数字或连字符。");
        }
        var base = options.base ? readTemplate(options.base, module) : null;
        if (base && (base.scene.width !== width || base.scene.height !== height)) {
            fail("当前作品尺寸须与选取的模板一致。");
        }
        var motion = isPS ? null : aeMotion(source);
        var png = options.external ? new File(options.external) :
            new File(file.parent.fsName + "/.vmix-plate-" + new Date().getTime() + ".png");
        var result = {
            format: "vibe-vmix-graphics", version: 2, module: module, slot: module === "football" ? "scoreboard" : "program",
            id: options.id, name: options.name,
            scene: { width: width, height: height, position: module === "football" ?
                { x: Math.min(960, width / 2 + 40), y: Math.min(540, height / 2 + 36) } :
                { x: Math.min(960, width / 2 + 96), y: Math.max(height / 2, 936 - height / 2) } }
        };
        if (motion) result.motion = motion.tracks;
        else if (base) result.motion = base.motion;
        else result.motion = stillTracks();
        if (base) result.scene.position = base.scene.position;
        if (module === "football") {
            var pack = options.pack ? readFootballPack(options.pack) : base && base.presentation;
            if (pack) result.presentation = {
                style: pack.style, labels: pack.labels, layers: pack.layers, logo: pack.logo || undefined
            };
            var fixtures = base && base.fixtures;
            if (!fixtures && pack) fixtures = pack.fixtures;
            if (fixtures) result.fixtures = fixtures;
        }
        function write(elements) {
            result.elements = elements;
            if (!options.external) saveTemplate(file, result);
            return result;
        }
        if (!isPS && !base) {
            aeScene(source, module, motion.hold, png, function (elements, error) {
                if (error) { callback(error); return; }
                try { write(elements); } catch (error) { callback(error); return; }
                callback(null, result);
            }, options.external);
            return null;
        }
        try {
            return write(isPS ? psScene(source, module, png, options.external) : base.elements);
        } finally { if (!options.external && png.exists) png.remove(); }
    }
    function idFor(value, module) {
        var hash = 0;
        for (var i = 0; i < value.length; i++) hash = ((hash * 31) + value.charCodeAt(i)) | 0;
        return module + "-" + (hash >>> 0).toString(36);
    }
    function open() {
        try {
            var isPS = /photoshop/i.test(app.name);
            var source = isPS ? (app.documents.length && app.activeDocument) : app.project.activeItem;
            if (!source || (!isPS && !(source instanceof CompItem))) {
                fail(isPS ? "请先打开需要做成模板的 Photoshop 文档。" : "请先在 AE 时间轴中打开需要导出的合成。");
            }
            var football = /football|bitfa|足球|比分/i.test(source.name);
            var win = new Window("dialog", "制作与导出工作台模板");
            win.alignChildren = "fill";
            var mode = win.add("dropdownlist", undefined, ["足球比分条", "舞台报幕条"]);
            mode.selection = football ? 0 : 1;
            var fields = win.add("panel", undefined, "实时文字");
            fields.orientation = "row"; fields.alignChildren = ["fill", "center"];
            var selector = fields.add("dropdownlist");
            selector.preferredSize.width = 185;
            var add = fields.add("button", undefined, "添加文字图层");
            var rigButton = isPS ? null : win.add("button", undefined, "创建入退场动画");
            var data = win.add("panel", undefined, "导出");
            data.alignChildren = "fill";
            var nameRow = data.add("group");
            nameRow.add("statictext", undefined, "模板名称");
            var name = nameRow.add("edittext", undefined, source.name.replace(/\.psd$/i, "").substring(0, 64));
            name.characters = 30;
            var idRow = data.add("group");
            idRow.add("statictext", undefined, "模板标识");
            var id = idRow.add("edittext"); id.characters = 30;
            var baseRow = data.add("group");
            var choose = baseRow.add("button", undefined, isPS ? "沿用已有模板的动效和预设" : "采用 PS 导出的模板");
            var baseLabel = baseRow.add("statictext", undefined, "当前作品", { truncate: "middle" });
            baseLabel.preferredSize.width = 150;
            var packRow = data.add("group");
            var choosePack = packRow.add("button", undefined, "合并足球全局包装");
            var packLabel = packRow.add("statictext", undefined, "选用已有模板", { truncate: "middle" });
            packLabel.preferredSize.width = 150;
            var output = data.add("button", undefined, "导出工作台模板");
            win.add("button", undefined, "关闭", { name: "cancel" });
            var base = null, pack = null;
            function module() { return mode.selection.index === 0 ? "football" : "stage"; }
            function refresh() {
                selector.removeAll();
                var first = module() === "football" ? 0 : 5;
                for (var i = first; i < first + 5; i++) selector.add("item", names[i]);
                selector.selection = 0;
                id.text = idFor(source.name, module());
                base = pack = null; baseLabel.text = "当前作品";
                packLabel.text = "选用已有模板";
                packRow.visible = module() === "football";
            }
            function perform(fn) {
                try { fn(); } catch (error) { alert(error.message || String(error)); }
            }
            mode.onChange = refresh;
            add.onClick = function () {
                perform(function () {
                    if (!isPS) app.beginUndoGroup("添加工作台实时文字");
                    try { addField(isPS, source, selector.selection.index + (module() === "football" ? 0 : 5)); }
                    finally { if (!isPS) app.endUndoGroup(); }
                    win.close();
                });
            };
            if (rigButton) rigButton.onClick = function () {
                perform(function () {
                    app.beginUndoGroup("创建工作台入退场");
                    try { addRig(source); } finally { app.endUndoGroup(); }
                    win.close();
                });
            };
            choose.onClick = function () {
                perform(function () {
                    var file = File.openDialog("选取已有的 .vmix-graphics.json", "*.json");
                    if (!file) return;
                    var template = readTemplate(file, module());
                    base = file; baseLabel.text = decodeURI(file.name);
                    name.text = template.name; id.text = template.id;
                });
            };
            choosePack.onClick = function () {
                perform(function () {
                    var file = File.openDialog("选择足球全局包装模板", "*.json");
                    if (!file) return;
                    readFootballPack(file);
                    pack = file; packLabel.text = decodeURI(file.name);
                });
            };
            output.onClick = function () {
                perform(function () {
                    if (!isPS && !app.preferences.getPrefAsLong("Main Pref Section", "Pref_SCRIPTING_FILE_NETWORK_SECURITY")) {
                        fail("请在 AE 的 编辑 → 首选项 → 脚本和表达式 中启用允许脚本写入文件，再导出模板。");
                    }
                    var folder;
                    if (base) folder = base.parent;
                    else if (!isPS && app.project.file) folder = app.project.file.parent;
                    else if (isPS) { try { folder = source.path; } catch (_) {} }
                    var initial = new File((folder || Folder.current).fsName + "/" + id.text + ".vmix-graphics.json");
                    var file = initial.saveDlg("保存工作台模板", "*.json");
                    if (!file) return;
                    if (!/\.vmix-graphics\.json$/i.test(file.name)) {
                        file = new File(file.fsName.replace(/\.json$/i, "") + ".vmix-graphics.json");
                        if (file.exists && !confirm("覆盖 " + decodeURI(file.name) + "？")) return;
                    }
                    function showResult(error) {
                        if (error) alert(error.message || String(error));
                        else alert("已导出工作台模板\n" + file.fsName);
                    }
                    var result = exportFile(isPS, source, file, { module: module(),
                        name: name.text.replace(/^\s+|\s+$/g, ""), id: id.text, base: base, pack: pack }, showResult);
                    win.close();
                    if (result) showResult();

                });
            };
            refresh(); win.center(); win.show();
        } catch (error) { alert(error.message || String(error)); }
    }
    function dispatch(encoded) {
        try {
            var request = JSON.parse(decodeURIComponent(encoded));
            var args = request.args || {}, isPS = /photoshop/i.test(app.name);
            var source = isPS ? (app.documents.length && app.activeDocument) : app.project && app.project.activeItem;
            var appName = isPS ? "PS" : "AE", result;
            if (request.action === "poll") {
                result = panelExport;
                if (result && result.done) panelExport = null;
                return JSON.stringify({ ok: true, result: result });
            }
            if (!source || (!isPS && !(source instanceof CompItem))) {
                if (request.action === "inspect") return JSON.stringify({ ok: true, result: { host: appName } });
                fail(isPS ? "请先打开一个 Photoshop 文档。" : "请先打开需要制作模板的 AE 合成。");
            }
            var width = isPS ? pixel(source.width) : source.width, height = isPS ? pixel(source.height) : source.height;
            var meta = { host: appName, name: source.name.replace(/\.psd$/i, ""), width: width, height: height,
                token: String(source.id) + ":" + source.name, suggestModule: /football|bitfa|足球|比分/i.test(source.name) ? "football" : "stage",
                footballId: idFor(source.name, "football"), stageId: idFor(source.name, "stage") };
            if (request.action === "inspect") return JSON.stringify({ ok: true, result: meta });
            if (args.token !== meta.token) fail("当前作品已切换，请刷新后重试。");
            if (args.module !== "football" && args.module !== "stage") fail("未知模板模块。");
            if (request.action === "choose") {
                if (args.kind !== "base" && args.kind !== "pack") fail("未知模板类型。");
                var selected = File.openDialog("选取工作台模板", "*.json");
                if (selected) {
                    var template = args.kind === "pack" ? readFootballPack(selected) : readTemplate(selected, args.module);
                    result = { path: selected.fsName, name: template.name, id: template.id };
                }
            } else if (request.action === "savePath") {
                var directory;
                if (!isPS && app.project.file) directory = app.project.file.parent;
                if (isPS) { try { directory = source.path; } catch (_) {} }
                var suggested = String(args.name || meta.name).replace(/[<>:"\/\\|?*]/g, "_");
                var initial = new File((directory || Folder.current).fsName + "/" + suggested + ".vmix-graphics.json");
                var selected = initial.saveDlg("导出工作台模板", "*.json");
                if (selected) {
                    if (!/\.vmix-graphics\.json$/i.test(selected.name)) {
                        selected = new File(selected.fsName.replace(/\.json$/i, "") + ".vmix-graphics.json");
                        if (selected.exists && !confirm("覆盖 " + decodeURI(selected.name) + "？")) {
                            return JSON.stringify({ ok: true, result: null });
                        }
                    }
                    result = selected.fsName;
                }
            } else if (request.action === "export") {
                if (pending) fail("正在导出模板。");
                panelExport = null;
                if (typeof args.output !== "string" || !/\.vmix-graphics\.json$/i.test(args.output) ||
                    typeof args.asset !== "string" || !/vmix-plate-[a-f0-9]{16}\.png$/i.test(args.asset)) fail("导出位置无效。");
                var output = new File(args.output);
                if (new File(args.asset).parent.fsName !== output.parent.fsName) fail("导出位置无效。");
                var options = { module: args.module, name: args.name, id: args.id, external: args.asset,
                    base: args.base ? new File(args.base) : null, pack: args.pack ? new File(args.pack) : null };
                var template = exportFile(isPS, source, output, options, function (error, template) {
                    panelExport = error ? { done: true, error: error.message || String(error) } :
                        { done: true, template: template, png: true };
                });
                result = template ? { done: true, template: template, png: isPS } : { done: false };
            } else if (request.action === "insert" || request.action === "rig") {
                sizeCheck(width, height);
                if (!isPS) app.beginUndoGroup("转播包装控件");
                try {
                    if (request.action === "rig" && !isPS) addRig(source);
                    else if (args.control === "football-kit" && args.module === "football") {
                        addWidget(isPS, source, "home", args.home);
                        addWidget(isPS, source, "away", args.away);
                        addWidget(isPS, source, "team.homeLogo"); addWidget(isPS, source, "team.awayLogo");
                        for (var i = 0; i < 5; i++) addField(isPS, source, i, true);
                    } else if (args.control === "stage-kit" && args.module === "stage") {
                        addWidget(isPS, source, "event.logo");
                        addField(isPS, source, 5, true); addField(isPS, source, 6, true);
                    } else if (args.control === "custom") addField(isPS, source, -1, true);
                    else if (args.control === "home" || args.control === "away" || /^team\.(homeLogo|awayLogo)$/.test(args.control)) {
                        if (args.module !== "football") fail("该控件属于足球模板。");
                        addWidget(isPS, source, args.control, args.control === "home" ? args.home : args.away);
                    } else if (args.control === "event.logo") addWidget(isPS, source, args.control);
                    else {
                        var index = -1;
                        for (var i = 0; i < keys.length; i++) if (keys[i] === args.control) index = i;
                        if (index < 0 || (index < 5) !== (args.module === "football")) fail("该文字字段属于另一模块。");
                        addField(isPS, source, index, true);
                    }
                } finally { if (!isPS) app.endUndoGroup(); }
                result = meta;
            } else fail("未知面板操作。");
            return JSON.stringify({ ok: true, result: result || null });
        } catch (error) { return JSON.stringify({ ok: false, error: error.message || String(error) }); }
    }
    return { open: open, dispatch: dispatch, pollRender: pollRender };
}());

