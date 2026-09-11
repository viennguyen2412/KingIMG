using System.Reflection;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KingImg;

public sealed class MainForm : Form
{
    private static readonly Color BackgroundColor = Color.FromArgb(0x14, 0x16, 0x1B);
    private readonly string? startupBatchCsvPath;
    private readonly string? startupTemplatePackagePath;

    private readonly WebView2 webView = new()
    {
        Dock = DockStyle.Fill,
        DefaultBackgroundColor = BackgroundColor
    };

    public MainForm(string? startupBatchCsvPath = null, string? startupTemplatePackagePath = null)
    {
        this.startupBatchCsvPath = startupBatchCsvPath;
        this.startupTemplatePackagePath = startupTemplatePackagePath;
        Text = "King Img";
        MinimumSize = new Size(1000, 720);
        Size = new Size(1100, 780);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = BackgroundColor;
        Controls.Add(webView);
        Load += HandleLoad;
    }

    private async void HandleLoad(object? sender, EventArgs e)
    {
        try
        {
            var paths = AppPaths.Ensure();
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: paths.WebViewDataDir);
            await webView.EnsureCoreWebView2Async(environment);

            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "kingimg.app",
                paths.RendererDir,
                CoreWebView2HostResourceAccessKind.Allow);

            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "kingimg-fonts.app",
                paths.CustomFontsDir,
                CoreWebView2HostResourceAccessKind.Allow);

            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "kingimg-bundled-fonts.app",
                paths.BundledFontsDir,
                CoreWebView2HostResourceAccessKind.Allow);

            webView.CoreWebView2.AddHostObjectToScript("kingimgApi", new KingImgApi(paths));

            webView.CoreWebView2.ProcessFailed += (_, args) =>
                StartupLog.Write($"WebView2 ProcessFailed: {args.ProcessFailedKind}");

            webView.CoreWebView2.NavigationCompleted += async (_, args) =>
            {
                if (!args.IsSuccess)
                {
                    StartupLog.Write($"NavigationCompleted failed: {args.WebErrorStatus}");
                    return;
                }

                if (!string.IsNullOrWhiteSpace(startupBatchCsvPath))
                {
                    try
                    {
                        await Task.Delay(1000);
                        var bridge = await webView.CoreWebView2.ExecuteScriptAsync("JSON.stringify({ native: !!(window.kingImg && window.kingImg.isNative), runner: typeof window.kingImgRunBatch, hostObjects: !!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects), syncHost: !!(window.chrome && window.chrome.webview && window.chrome.webview.hostObjects && window.chrome.webview.hostObjects.sync) })");
                        StartupLog.Write($"startup batch bridge: {bridge}");
                        var csvPath = JsonSerializer.Serialize(startupBatchCsvPath);
                        var packagePath = JsonSerializer.Serialize(startupTemplatePackagePath);
                        var result = await webView.CoreWebView2.ExecuteScriptAsync($"(async () => {{ if (typeof window.kingImgRunBatch !== 'function') throw new Error('Batch runner chưa sẵn sàng.'); return await window.kingImgRunBatch({csvPath}, {packagePath}); }})()");
                        StartupLog.Write($"startup batch completed: {result}");
                    }
                    catch (Exception ex)
                    {
                        StartupLog.Write("startup batch failed", ex);
                    }
                }
            };

            webView.Source = new Uri("https://kingimg.app/index.html");
            StartupLog.Write("window loaded");
        }
        catch (Exception ex)
        {
            StartupLog.Write("HandleLoad failed", ex);
            MessageBox.Show(ex.Message, "King Img", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

public sealed record AppPaths(
    string DataDir,
    string RendererDir,
    string BundledFontsDir,
    string CustomFontsDir,
    string WebViewDataDir,
    string PresetsFile,
    string TemplatesFile,
    string FontRegistryFile)
{
    internal static string PortableDataDir => Path.Combine(ResolvePortableRoot(), "Data");

    private static string LegacyDataDir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "King Img");

    public static AppPaths Ensure()
    {
        var dataDir = PortableDataDir;
        var webDir = Path.Combine(dataDir, "web");
        var rendererDir = Path.Combine(webDir, "renderer");
        var bundledFontsDir = Path.Combine(webDir, "fonts-bundled");
        var customFontsDir = Path.Combine(dataDir, "fonts");
        var webViewDataDir = Path.Combine(dataDir, "WebView2");

        Directory.CreateDirectory(dataDir);
        Directory.CreateDirectory(webDir);
        Directory.CreateDirectory(rendererDir);
        Directory.CreateDirectory(bundledFontsDir);
        Directory.CreateDirectory(customFontsDir);
        Directory.CreateDirectory(webViewDataDir);

        MigrateLegacyData(LegacyDataDir, dataDir);
        ExtractEmbeddedFolder("renderer/", rendererDir);
        ExtractEmbeddedFolder("fonts-bundled/", bundledFontsDir);

        var paths = new AppPaths(
            dataDir,
            rendererDir,
            bundledFontsDir,
            customFontsDir,
            webViewDataDir,
            Path.Combine(dataDir, "presets.json"),
            Path.Combine(dataDir, "templates.json"),
            Path.Combine(customFontsDir, "registry.json"));

        if (!File.Exists(paths.PresetsFile))
        {
            File.WriteAllText(paths.PresetsFile, KingImgApi.DefaultPresetsJson);
        }

        if (!File.Exists(paths.TemplatesFile))
        {
            File.WriteAllText(paths.TemplatesFile, "[]");
        }

        if (!File.Exists(paths.FontRegistryFile))
        {
            File.WriteAllText(paths.FontRegistryFile, "[]");
        }

        return paths;
    }

    private static string ResolvePortableRoot()
    {
        var startPaths = new List<string> { AppContext.BaseDirectory };
        var processDirectory = string.IsNullOrWhiteSpace(Environment.ProcessPath)
            ? null
            : Path.GetDirectoryName(Environment.ProcessPath);

        if (!string.IsNullOrWhiteSpace(processDirectory)
            && !startPaths.Contains(processDirectory, StringComparer.OrdinalIgnoreCase))
        {
            startPaths.Add(processDirectory);
        }

        foreach (var startPath in startPaths)
        {
            var portableRoot = FindPortableRoot(startPath);
            if (portableRoot is not null)
            {
                return portableRoot;
            }
        }

        // Không thấy KingImg.portable.json ở đâu (bản cài qua installer): AppContext.BaseDirectory
        // trỏ vào thư mục tự giải nén tạm của .NET single-file (đổi mỗi lần chạy vì
        // IncludeAllContentForSelfExtract=true) — không dùng được để lưu dữ liệu lâu dài.
        // processDirectory là thư mục thật chứa file .exe đã cài (ổn định, ghi được vì cài per-user).
        return processDirectory ?? AppContext.BaseDirectory;
    }

    private static string? FindPortableRoot(string startPath)
    {
        var current = new DirectoryInfo(startPath);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "KingImg.portable.json")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return null;
    }

    private static void MigrateLegacyData(string legacyDir, string portableDir)
    {
        if (!Directory.Exists(legacyDir) || PathsEqual(legacyDir, portableDir))
        {
            return;
        }

        try
        {
            var migrated = false;
            foreach (var fileName in new[] { "presets.json", "templates.json", "startup.log" })
            {
                migrated |= CopyFileIfMissing(
                    Path.Combine(legacyDir, fileName),
                    Path.Combine(portableDir, fileName));
            }

            migrated |= CopyDirectoryFilesIfMissing(
                Path.Combine(legacyDir, "fonts"),
                Path.Combine(portableDir, "fonts"));

            if (migrated)
            {
                StartupLog.Write($"migrated legacy data from {legacyDir} to {portableDir}");
            }
        }
        catch (Exception ex)
        {
            StartupLog.Write("portable data migration failed", ex);
        }
    }

    private static bool CopyFileIfMissing(string sourcePath, string destinationPath)
    {
        if (!File.Exists(sourcePath) || File.Exists(destinationPath))
        {
            return false;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        File.Copy(sourcePath, destinationPath);
        return true;
    }

    private static bool CopyDirectoryFilesIfMissing(string sourceDir, string destinationDir)
    {
        if (!Directory.Exists(sourceDir))
        {
            return false;
        }

        var copied = false;
        foreach (var sourcePath in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relativePath = Path.GetRelativePath(sourceDir, sourcePath);
            var destinationPath = Path.Combine(destinationDir, relativePath);
            copied |= CopyFileIfMissing(sourcePath, destinationPath);
        }

        return copied;
    }

    private static bool PathsEqual(string left, string right)
    {
        var normalizedLeft = Path.GetFullPath(left).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var normalizedRight = Path.GetFullPath(right).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return string.Equals(normalizedLeft, normalizedRight, StringComparison.OrdinalIgnoreCase);
    }

    private static void ExtractEmbeddedFolder(string prefix, string targetDir)
    {
        var assembly = Assembly.GetExecutingAssembly();
        foreach (var resourceName in assembly.GetManifestResourceNames().Where(n => n.StartsWith(prefix, StringComparison.Ordinal)))
        {
            var relative = resourceName[prefix.Length..].Replace('/', Path.DirectorySeparatorChar);
            if (string.IsNullOrWhiteSpace(relative))
            {
                continue;
            }

            var targetPath = Path.Combine(targetDir, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(targetPath)!);

            using var source = assembly.GetManifestResourceStream(resourceName);
            if (source is null)
            {
                continue;
            }

            using var target = File.Create(targetPath);
            source.CopyTo(target);
        }
    }
}
