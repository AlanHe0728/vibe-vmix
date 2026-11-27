using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("转播包装工作台")]
[assembly: System.Reflection.AssemblyProduct("转播包装工作台")]
[assembly: System.Reflection.AssemblyVersion("2.1.1.0")]
[assembly: System.Reflection.AssemblyInformationalVersion("2.1.1")]
[assembly: System.Runtime.Versioning.TargetFramework(".NETFramework,Version=v4.7.2")]

internal static class Program {
    internal static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    internal static readonly string Data = Environment.GetEnvironmentVariable("BROADCAST_DATA") ?? Path.Combine(Root, "data");
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    internal static Process Service;
    internal static string Origin;
    internal static CoreWebView2Environment EnvironmentView;
    private static Mutex single;
    [STAThread]
    private static void Main() {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool created;
        single = new Mutex(true, "Local\\BroadcastWorkspace-" + Root.GetHashCode(), out created);
        if (!created) { MessageBox.Show("工作台已在运行，请切换到已有窗口。", "转播包装工作台"); return; }
        try {
            Directory.CreateDirectory(Data);
            Application.Run(new WorkspaceForm(null, true));
        } catch (Exception error) { Fail(error); }
        finally { Stop(); single.ReleaseMutex(); single.Dispose(); }
    }
    internal static void Fail(Exception error) {
        try { Directory.CreateDirectory(Data); File.AppendAllText(Path.Combine(Data, "desktop-error.log"), DateTime.UtcNow + " " + error + "\r\n"); } catch { }
        MessageBox.Show(error.Message + "\r\n\r\n请完整解压程序文件夹。需要 .NET Framework 4.7.2 或以上与 Microsoft Edge WebView2 运行时。\r\n已有数据保留在：" + Data, "转播包装工作台", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
    internal static async Task Start() {
        // Verify the shared Windows runtime before creating a background service.
        CoreWebView2Environment.GetAvailableBrowserVersionString();
        var options = new CoreWebView2EnvironmentOptions();
        string debug = Environment.GetEnvironmentVariable("BROADCAST_DEBUG_PORT");
        int port;
        if (Environment.GetEnvironmentVariable("BROADCAST_DESKTOP_TEST") == "1" && Int32.TryParse(debug, out port)) options.AdditionalBrowserArguments = "--remote-debugging-port=" + port + " --remote-debugging-address=127.0.0.1";
        EnvironmentView = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Data, "webview"), options);
        var start = new ProcessStartInfo(Path.Combine(Root, "runtime", "node.exe"));
        start.Arguments = "\"" + Path.Combine(Root, "app", "server", "workspace-entry.js") + "\" \"" + Data.TrimEnd('\\') + "\"";
        start.WorkingDirectory = Root;
        start.UseShellExecute = false; start.CreateNoWindow = true;
        start.RedirectStandardOutput = true; start.RedirectStandardError = true; start.RedirectStandardInput = true;
        start.EnvironmentVariables["BROADCAST_DESKTOP"] = "1";
        Service = Process.Start(start);
        Service.ErrorDataReceived += (sender, args) => {
            if (!String.IsNullOrEmpty(args.Data)) { try { File.AppendAllText(Path.Combine(Data, "service-error.log"), args.Data + "\r\n"); } catch { } }
        };
        Service.BeginErrorReadLine();
        var lineTask = Service.StandardOutput.ReadLineAsync();
        if (await Task.WhenAny(lineTask, Task.Delay(20000)) != lineTask) throw new Exception("本地服务启动超时，请查看 data 中的日志。");
        string line = await lineTask;
        if (String.IsNullOrEmpty(line)) throw new Exception("本地服务未能启动，请查看 data/service-error.log。");
        var ready = Json.Deserialize<Dictionary<string, object>>(line);
        Origin = Convert.ToString(ready["origin"]);
    }
    internal static Dictionary<string, object> Workspace() {
        var request = WebRequest.CreateHttp(Origin + "/api/workspace"); request.Timeout = 3000;
        using (var response = request.GetResponse()) using (var reader = new StreamReader(response.GetResponseStream())) return Json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
    }
    internal static string StageOrigin() {
        foreach (Dictionary<string, object> entry in (object[])Workspace()["modules"]) if (Convert.ToString(entry["id"]) == "stage" && Convert.ToBoolean(entry["enabled"])) return Convert.ToString(entry["url"]);
        throw new Exception("舞台模块尚未启用。");
    }
    internal static bool Local(string value) {
        Uri uri;
        if (!Uri.TryCreate(value, UriKind.Absolute, out uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1") return false;
        if (uri.GetLeftPart(UriPartial.Authority) == Origin) return true;
        try { foreach (Dictionary<string, object> entry in (object[])Workspace()["modules"]) if (Convert.ToBoolean(entry["enabled"]) && Convert.ToString(entry["url"]) == uri.GetLeftPart(UriPartial.Authority)) return true; } catch { }
        return false;
    }
    internal static void Stop() {
        if (Service == null) return;
        try { if (!Service.HasExited) { Service.StandardInput.WriteLine("quit"); Service.StandardInput.Close(); if (!Service.WaitForExit(4000)) Service.Kill(); } } catch { }
        Service.Dispose(); Service = null;
        try { File.Delete(Path.Combine(Data, "active-host.json")); } catch { }
    }
}

internal sealed class WorkspaceForm : Form {
    private static readonly Size InitialWindowSize = new Size(1480, 980);
    private static readonly Size MinimumWindowSize = new Size(640, 450);
    private readonly WebView2 view = new WebView2();
    private readonly bool main;
    private bool customTitleBar;
    private readonly string destination;
    private readonly Control placementAnchor;
    private readonly Dictionary<string, WorkspaceForm> previewWindows = new Dictionary<string, WorkspaceForm>();
    private readonly Label loading = new Label();
    internal WorkspaceForm(string url, bool isMain, Control anchor = null) {
        main = isMain; destination = url; placementAnchor = anchor;
        customTitleBar = isMain || (url != null && new Uri(url).AbsolutePath == "/workspace/preview.html");
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        Text = "转播包装工作台"; Size = InitialWindowSize; MinimumSize = MinimumWindowSize;
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.White;
        if (Environment.GetEnvironmentVariable("BROADCAST_DESKTOP_TEST") == "1") { Opacity = 0; ShowInTaskbar = false; }
        string icon = Path.Combine(Program.Root, "workspace.ico"); if (File.Exists(icon)) Icon = new Icon(icon);
        view.Dock = DockStyle.Fill; Controls.Add(view);
        loading.Text = "正在启动工作空间…"; loading.Dock = DockStyle.Fill; loading.TextAlign = ContentAlignment.MiddleCenter; Controls.Add(loading); loading.BringToFront();
        Shown += async (sender, args) => await Initialize();
        FormClosed += (sender, args) => {
            view.Dispose();
            if (!main) return;
            foreach (var preview in new List<WorkspaceForm>(previewWindows.Values)) preview.Close();
            foreach (Form child in OwnedForms) child.Close();
            Program.Stop();
        };
        Resize += async (sender, args) => {
            if (view.CoreWebView2 == null) return;
            SendWindowState();
            try { if (WindowState == FormWindowState.Minimized) await view.CoreWebView2.TrySuspendAsync(); else view.CoreWebView2.Resume(); } catch { }
        };
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    protected override void WndProc(ref Message message) {
        if (customTitleBar && message.Msg == 0x0083 && message.WParam != IntPtr.Zero) {
            // Keep the system resize frame and let the existing web toolbar occupy the caption.
            var outer = (NativeRect)Marshal.PtrToStructure(message.LParam, typeof(NativeRect));
            base.WndProc(ref message);
            var client = (NativeRect)Marshal.PtrToStructure(message.LParam, typeof(NativeRect));
            client.Top = outer.Top + (WindowState == FormWindowState.Maximized ? client.Left - outer.Left : 1);
            Marshal.StructureToPtr(client, message.LParam, false);
            message.Result = IntPtr.Zero;
            return;
        }
        base.WndProc(ref message);
    }
    private void SendWindowState() {
        if (!customTitleBar || view.CoreWebView2 == null) return;
        try {
            view.CoreWebView2.PostWebMessageAsJson(Program.Json.Serialize(new {
                type = "window-state", maximized = WindowState == FormWindowState.Maximized
            }));
        } catch (InvalidOperationException) { }
        catch (COMException) { }
    }
    private void ApplyWindowTheme(string theme) {
        bool dark = theme == "dark";
        BackColor = dark ? Color.FromArgb(20, 19, 22) : Color.White;
        view.DefaultBackgroundColor = BackColor;
        loading.BackColor = BackColor;
        loading.ForeColor = dark ? Color.White : Color.Black;
        try {
            int enabled = dark ? 1 : 0;
            DwmSetWindowAttribute(Handle, 20, ref enabled, sizeof(int));
            int caption = ColorTranslator.ToWin32(BackColor);
            DwmSetWindowAttribute(Handle, 35, ref caption, sizeof(int));
        } catch (DllNotFoundException) { }
        catch (EntryPointNotFoundException) { }
    }
    protected override void OnLoad(EventArgs e) {
        base.OnLoad(e);
        var area = Screen.FromControl(placementAnchor ?? Owner ?? this).WorkingArea;
        var available = Size.Subtract(area.Size, new Size(24, 24));
        float scale = CurrentAutoScaleDimensions.Width / 96F;
        MinimumSize = FitWindowSize(MinimumWindowSize, available, scale);
        var size = FitWindowSize(InitialWindowSize, available, scale);
        var width = size.Width;
        var height = size.Height;
        Bounds = new Rectangle(area.Left + (area.Width - width) / 2,
            area.Top + (area.Height - height) / 2, width, height);
    }
    private static Size FitWindowSize(Size logical, Size available, float scale) {
        return new Size(Math.Min((int)Math.Round(logical.Width * scale), available.Width),
            Math.Min((int)Math.Round(logical.Height * scale), available.Height));
    }
    private async Task Initialize() {
        try {
            if (main) await Program.Start();
            await view.EnsureCoreWebView2Async(Program.EnvironmentView);
            var core = view.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = Environment.GetEnvironmentVariable("BROADCAST_DESKTOP_TEST") == "1";
            core.Settings.IsStatusBarEnabled = false; core.Settings.IsPasswordAutosaveEnabled = false; core.Settings.IsGeneralAutofillEnabled = false;
            if (customTitleBar) {
                try { core.Settings.IsNonClientRegionSupportEnabled = true; }
                catch (NotImplementedException) { customTitleBar = false; }
                catch (COMException) { customTitleBar = false; }
                if (!customTitleBar) SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0027);
                else await core.AddScriptToExecuteOnDocumentCreatedAsync("window.workspaceWindow={customTitleBar:true};");
            }
            core.NavigationStarting += (sender, args) => { if (args.Uri != "about:blank" && !Program.Local(args.Uri)) args.Cancel = true; };
            core.NewWindowRequested += (sender, args) => { args.Handled = true; if (Program.Local(args.Uri)) { var child = new WorkspaceForm(args.Uri, false); child.Show(this); } };
            core.PermissionRequested += (sender, args) => { args.State = CoreWebView2PermissionState.Deny; };
            core.WebMessageReceived += async (sender, args) => await Message(args);
            core.ProcessFailed += (sender, args) => { loading.Text = "窗口进程已退出，请关闭后重新打开软件。已保存数据保留。"; loading.Show(); loading.BringToFront(); };
            core.NavigationCompleted += (sender, args) => { loading.Hide(); SendWindowState(); };
            core.Navigate(destination ?? Program.Origin + "/workspace/index.html");
            if (main) File.WriteAllText(Path.Combine(Program.Data, "active-host.json"), Program.Json.Serialize(new { origin = Program.Origin, hostPid = Process.GetCurrentProcess().Id, servicePid = Program.Service.Id, windowHandle = Handle.ToInt64() }));
        } catch (Exception error) { Program.Fail(error); Close(); }
    }
    private async Task Message(CoreWebView2WebMessageReceivedEventArgs args) {
        if (!args.Source.StartsWith(Program.Origin + "/workspace/", StringComparison.Ordinal)) return;
        try {
            var message = Program.Json.Deserialize<Dictionary<string, object>>(args.WebMessageAsJson);
            string type = Convert.ToString(message["type"]);
            if (type == "window-command" && customTitleBar) {
                string action = Convert.ToString(message["action"]);
                if (action == "minimize") WindowState = FormWindowState.Minimized;
                else if (action == "maximize") WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
                else if (action == "close") { Close(); return; }
                SendWindowState();
                return;
            }
            if (type == "window-theme") {
                ApplyWindowTheme(Convert.ToString(message["theme"]));
                return;
            }
            if (!main) return;
            if (type == "open-preview") {
                string id = message.ContainsKey("module") ? Convert.ToString(message["module"]) : "all";
                if (!new List<string> { "all", "stage", "football", "ae-live" }.Contains(id)) return;
                string url = Program.Origin + "/workspace/preview.html?module=" + Uri.EscapeDataString(id);
                WorkspaceForm existing;
                if (previewWindows.TryGetValue(url, out existing)) {
                    if (existing.WindowState == FormWindowState.Minimized) existing.WindowState = FormWindowState.Normal;
                    existing.Activate();
                    return;
                }
                var preview = new WorkspaceForm(url, false, this);
                preview.Text = "预览与布局";
                previewWindows.Add(url, preview);
                preview.FormClosed += (sender, eventArgs) => previewWindows.Remove(url);
                preview.Show();
            } else if (type == "list-fonts") {
                using (var collection = new System.Drawing.Text.InstalledFontCollection()) {
                    var names = new SortedSet<string>(StringComparer.CurrentCultureIgnoreCase);
                    foreach (FontFamily family in collection.Families) {
                        names.Add(family.Name);
                        family.Dispose();
                    }
                    await view.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('native-fonts',{detail:" + Program.Json.Serialize(new { fonts = new List<string>(names) }) + "}));");
                }
            } else if (type == "open-folder") {
                using (var picker = new FolderBrowserDialog()) {
                    picker.Description = "选择舞台素材文件夹"; picker.ShowNewFolderButton = false;
                    if (picker.ShowDialog(this) == DialogResult.OK)
                        await view.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('native-folder',{detail:" + Program.Json.Serialize(new { path = picker.SelectedPath }) + "}));");
                }
            } else if (type == "import-source") {
                using (var picker = new OpenFileDialog()) {
                    picker.Title = "链接舞台包装工程"; picker.Filter = "包装工程|*.gtzip;*.gtxml;*.aep;*.aepx;*.nbtitle;*.nbtlproj;*.nbtlpkg"; picker.CheckFileExists = true;
                    if (picker.ShowDialog(this) == DialogResult.OK) await view.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('native-source',{detail:" + Program.Json.Serialize(new { path = picker.FileName }) + "}));");
                }
            } else if (type == "open-source") {
                // Resolve only registered assets, never a filename supplied by page content.
                string origin = Program.StageOrigin();
                var request = WebRequest.CreateHttp(origin + "/api/stage/library"); request.Timeout = 3000;
                Dictionary<string, object> library;
                using (var response = await request.GetResponseAsync()) using (var reader = new StreamReader(response.GetResponseStream())) library = Program.Json.Deserialize<Dictionary<string, object>>(await reader.ReadToEndAsync());
                string id = Convert.ToString(message["assetId"]), file = null;
                foreach (Dictionary<string, object> entry in (object[])library["assets"]) {
                    if (Convert.ToString(entry["id"]) != id) continue;
                    if (entry.ContainsKey("sourcePath")) file = Convert.ToString(entry["sourcePath"]);
                    else file = Path.Combine(Program.Data, "stage", "assets", Path.GetFileName(Convert.ToString(entry["file"])));
                }
                string extension = Path.GetExtension(file ?? "").ToLowerInvariant();
                if (file == null || !File.Exists(file) || !new List<string> { ".aep", ".aepx", ".nbtitle", ".nbtlproj", ".nbtlpkg", ".gtzip", ".gtxml" }.Contains(extension)) throw new Exception("找不到可打开的工程。");
                Process.Start(new ProcessStartInfo(file) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(file) });
            }
        } catch (Exception error) { MessageBox.Show(this, error.Message, "工程操作", MessageBoxButtons.OK, MessageBoxIcon.Information); }
    }
}
