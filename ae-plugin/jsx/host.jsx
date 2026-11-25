#include "../vendor/json2.jsx"
/* ExtendScript runs in AE, never in the browser. All RPC is a fixed whitelist. */
var BroadcastLive = (function () {
    function active(id) {
        var comp = app.project && app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("请先在 AE 中选中一个合成");
        if (id !== undefined && comp.id !== id) throw new Error("当前合成已改变，请重新读取合成");
        return comp;
    }
    function isLive(layer) { return layer.name.indexOf("LIVE:") === 0; }
    function layerId(layer) { try { if (layer.id) return layer.id; } catch (_) {} return layer.index; }
    function inspect() {
        var comp = active(), controls = [], markers = [], i, j, layer, source, effects, effect, kind, value;
        for (i = 1; i <= comp.numLayers && controls.length < 300; i++) {
            layer = comp.layer(i); if (!isLive(layer)) continue;
            source = layer.property("ADBE Text Properties");
            if (source) {
                source = source.property("ADBE Text Document");
                controls.push({id: String(layerId(layer)) + ":text", kind: "text", label: layer.name.substring(5), layerId: layerId(layer), layerIndex: i, layerName: layer.name, value: source.value.text});
            }
            effects = layer.property("ADBE Effect Parade");
            if (!effects) continue;
            for (j = 1; j <= effects.numProperties && controls.length < 300; j++) {
                effect = effects.property(j); kind = null;
                if (effect.matchName === "ADBE Slider Control") kind = "number";
                if (effect.matchName === "ADBE Color Control") kind = "color";
                if (effect.matchName === "ADBE Checkbox Control") kind = "checkbox";
                if (!kind) continue;
                value = effect.property(1).value;
                if (kind === "color") value = [value[0], value[1], value[2]];
                controls.push({id: String(layerId(layer)) + ":effect:" + j, kind: kind, label: layer.name.substring(5) + " / " + effect.name, layerId: layerId(layer), layerIndex: i, layerName: layer.name, effectIndex: j, effectMatchName: effect.matchName, effectName: effect.name, value: value});
            }
        }
        var property = comp.markerProperty;
        for (i = 1; i <= property.numKeys; i++) markers.push({name: property.keyValue(i).comment, time: property.keyTime(i)});
        return {comp: {id: comp.id, name: comp.name, width: comp.width, height: comp.height, fps: comp.frameRate, duration: comp.duration, time: comp.time, workAreaStart: comp.workAreaStart, workAreaDuration: comp.workAreaDuration}, controls: controls, markers: markers};
    }
    function setControl(args) {
        var comp = active(args.compId), control = args.control, layer = comp.layer(control.layerIndex), property, value;
        if (!layer || layerId(layer) !== control.layerId || layer.name !== control.layerName || !isLive(layer)) throw new Error("直播图层已改变，请重新读取");
        if (layer.locked) throw new Error("此图层已锁定，请在 AE 中解锁后修改");
        app.beginUndoGroup("直播控件修改");
        try {
            if (control.kind === "text") {
                property = layer.property("ADBE Text Properties").property("ADBE Text Document");
                if (property.numKeys > 0) throw new Error("文本有关键帧，请先移除关键帧或另建直播文字图层");
                value = property.value; value.text = String(args.value); property.setValue(value);
            } else {
                var effect = layer.property("ADBE Effect Parade").property(control.effectIndex);
                var permitted = {number: "ADBE Slider Control", color: "ADBE Color Control", checkbox: "ADBE Checkbox Control"};
                if (!effect || effect.matchName !== permitted[control.kind] || effect.name !== control.effectName) throw new Error("效果控件已改变，请重新读取");
                property = effect.property(1);
                if (property.numKeys > 0 || property.expressionEnabled) throw new Error("控件有关键帧或表达式，请先在 AE 中处理绑定");
                property.setValue(args.value);
            }
        } finally { app.endUndoGroup(); }
        return {snapshot: inspect()};
    }
    function frame(args) {
        var comp = active(args.compId), factor = comp.resolutionFactor, seconds = args.seconds === undefined ? comp.time : args.seconds, started = new Date().getTime();
        if (seconds < 0 || seconds >= comp.duration || !args.output || !/\.png$/i.test(args.output)) throw new Error("画面输出参数无效");
        try { comp.resolutionFactor = [args.resolution || 1, args.resolution || 1]; comp.saveFrameToPng(seconds, new File(args.output)); }
        finally { comp.resolutionFactor = factor; }
        return {file: args.output, milliseconds: new Date().getTime() - started};
    }
    function renderClip(args) {
        var comp = active(args.compId), queue = app.project.renderQueue, original = [], item = null, i, output;
        if (queue.rendering) throw new Error("AE 已在渲染，请稍后再试");
        if (!args.output || !/\.mov$/i.test(args.output)) throw new Error("缓存输出路径无效");
        for (i = 1; i <= queue.numItems; i++) original.push({item: queue.item(i), render: queue.item(i).render});
        try {
            for (i = 0; i < original.length; i++) if (original[i].render) original[i].item.render = false;
            item = queue.items.add(comp); item.timeSpanStart = comp.workAreaStart; item.timeSpanDuration = comp.workAreaDuration;
            output = item.outputModule(1); output.applyTemplate(args.outputModule); output.file = new File(args.output);
            item.render = true; queue.render();
            if (item.status !== RQItemStatus.DONE) throw new Error("AE 渲染未完成或已取消");
        } finally {
            if (item) { try { item.remove(); } catch (_) {} }
            for (i = 0; i < original.length; i++) { try { original[i].item.render = original[i].render; } catch (_) {} }
        }
        return {file: args.output, snapshot: inspect()};
    }
    function markers(args) {
        var comp = active(args.compId), property = comp.markerProperty, duration = comp.workAreaDuration, start = comp.workAreaStart, names = ["LIVE_IN", "LIVE_HOLD", "LIVE_OUT"], times = [start, start + duration * .35, start + duration * .75], i, j, found;
        app.beginUndoGroup("添加直播标记");
        try {
            for (i = 0; i < names.length; i++) {
                found = false;
                for (j = 1; j <= property.numKeys; j++) if (property.keyValue(j).comment === names[i]) found = true;
                if (found) continue;
                // Existing user markers are never overwritten.
                for (j = 1; j <= property.numKeys; j++) if (Math.abs(property.keyTime(j) - times[i]) < comp.frameDuration / 2) times[i] += comp.frameDuration;
                if (times[i] < comp.duration) property.setValueAtTime(times[i], new MarkerValue(names[i]));
            }
        } finally { app.endUndoGroup(); }
        return {snapshot: inspect()};
    }
    function expose() {
        var comp = active(), selected = comp.selectedLayers, i;
        app.beginUndoGroup("标记直播图层");
        try { for (i = 0; i < selected.length; i++) if (!isLive(selected[i])) selected[i].name = "LIVE:" + selected[i].name; }
        finally { app.endUndoGroup(); }
        return {snapshot: inspect()};
    }
    function demo() {
        app.beginUndoGroup("创建直播示例");
        try {
            var comp = app.project.items.addComp("Live Bridge 示例字幕", 1920, 1080, 1, 8, 30), controller = comp.layers.addNull(), slider, color, toggle, background, group, rectangle, fill, title, subtitle;
            controller.name = "LIVE:Controls"; controller.enabled = false;
            slider = controller.property("ADBE Effect Parade").addProperty("ADBE Slider Control"); slider.name = "Size"; slider.property(1).setValue(64);
            color = controller.property("ADBE Effect Parade").addProperty("ADBE Color Control"); color.name = "Accent"; color.property(1).setValue([.08, .25, .4]);
            toggle = controller.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control"); toggle.name = "Visible"; toggle.property(1).setValue(1);
            background = comp.layers.addShape(); background.name = "字幕底板";
            group = background.property("ADBE Root Vectors Group"); rectangle = group.addProperty("ADBE Vector Shape - Rect"); rectangle.property("ADBE Vector Rect Size").setValue([1250, 180]);
            fill = group.addProperty("ADBE Vector Graphic - Fill"); fill.property("ADBE Vector Fill Color").expression = "thisComp.layer('LIVE:Controls').effect('Accent')(1)";
            background.property("ADBE Transform Group").property("ADBE Position").setValue([730, 890]);
            title = comp.layers.addText("节目名称"); title.name = "LIVE:Title"; title.property("ADBE Transform Group").property("ADBE Position").setValue([145, 865]);
            title.property("ADBE Text Properties").property("ADBE Text Document").expression = "text.sourceText.style.setFontSize(thisComp.layer('LIVE:Controls').effect('Size')(1)).setFillColor([1,1,1])";
            subtitle = comp.layers.addText("表演者 / 演出单位"); subtitle.name = "LIVE:Subtitle"; subtitle.property("ADBE Transform Group").property("ADBE Position").setValue([145, 935]);
            var document = subtitle.property("ADBE Text Properties").property("ADBE Text Document").value; document.fontSize = 32; document.fillColor = [1,1,1]; subtitle.property("ADBE Text Properties").property("ADBE Text Document").setValue(document);
            var layers = [title, subtitle, background], i, opacity;
            for (i = 0; i < layers.length; i++) {
                opacity = layers[i].property("ADBE Transform Group").property("ADBE Opacity"); opacity.setValueAtTime(0, 0); opacity.setValueAtTime(.4, 100); opacity.setValueAtTime(7.5, 100); opacity.setValueAtTime(7.95, 0); opacity.expression = "value * thisComp.layer('LIVE:Controls').effect('Visible')(1)";
            }
            comp.time = 1; comp.openInViewer();
        } finally { app.endUndoGroup(); }
        return {snapshot: inspect()};
    }
    function dispatch(encoded) {
        try {
            var request = JSON.parse(decodeURIComponent(encoded)), args = request.args || {}, result;
            if (request.type === "inspect") result = {snapshot: inspect()};
            else if (request.type === "setControl") result = setControl(args);
            else if (request.type === "frame") result = frame(args);
            else if (request.type === "renderClip") result = renderClip(args);
            else if (request.type === "markers") result = markers(args);
            else if (request.type === "expose") result = expose();
            else if (request.type === "demo") result = demo();
            else if (request.type === "seek") { var comp = active(args.compId); if (args.seconds < 0 || args.seconds >= comp.duration) throw new Error("定位超出合成时长"); comp.time = args.seconds; result = {snapshot: inspect()}; }
            else throw new Error("不支持此插件操作");
            result.ok = true; return JSON.stringify(result);
        } catch (error) { return JSON.stringify({ok: false, error: String(error.message || error)}); }
    }
    return {dispatch: dispatch};
}());
