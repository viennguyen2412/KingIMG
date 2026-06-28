using System.Reflection;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KingImg;

public sealed class MainForm : Form
{
    private readonly WebView2 webView = new() { Dock = DockStyle.Fill };

    public MainForm()
    {
        Text = "King Img";
        MinimumSize = new Size(960, 700);
        WindowState = FormWindowState.Maximized;
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
            webView.Source = new Uri("https://kingimg.app/index.html");
        }
        catch (Exception ex)
        {
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
    public static AppPaths Ensure()
    {
        var dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "King Img");
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
