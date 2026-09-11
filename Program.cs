using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;

namespace KingImg;

internal static class Program
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SetCurrentProcessExplicitAppUserModelID(string appId);

    [STAThread]
    private static void Main(string[] args)
    {
        SetCurrentProcessExplicitAppUserModelID("com.kingimg.app");

        Application.ThreadException += (_, e) =>
        {
            StartupLog.Write("ThreadException", e.Exception);
            ShowCrashDialog();
        };
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        {
            StartupLog.Write("UnhandledException", e.ExceptionObject as Exception);
            ShowCrashDialog();
        };

        StartupLog.Write("app starting");
        ApplicationConfiguration.Initialize();

        var startup = StartupBatchArguments.Parse(args);
        if (!string.IsNullOrWhiteSpace(startup.CsvPath))
        {
            try
            {
                var result = BatchTextRenderer.Run(startup.CsvPath, startup.TemplatePackagePath, AppPaths.Ensure());
                StartupLog.Write($"headless batch completed: {result.FileCount} files → {result.OutputFolder}");
            }
            catch (Exception ex)
            {
                StartupLog.Write("headless batch failed", ex);
            }

            return;
        }

        try
        {
            _ = CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch (Exception ex)
        {
            StartupLog.Write("WebView2 Runtime not found", ex);

            var result = MessageBox.Show(
                "Máy chưa có Microsoft Edge WebView2 Runtime. King Img cần thành phần này để mở giao diện.\n\nBấm OK để mở trang tải chính thức của Microsoft.",
                "King Img",
                MessageBoxButtons.OKCancel,
                MessageBoxIcon.Warning);

            if (result == DialogResult.OK)
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "https://developer.microsoft.com/microsoft-edge/webview2/",
                    UseShellExecute = true
                });
            }

            return;
        }

        StartupLog.Write("createWindow");
        Application.Run(new MainForm());
    }

    private static void ShowCrashDialog()
    {
        try
        {
            MessageBox.Show(
                $"King Img gặp lỗi và cần đóng.\n\nChi tiết lỗi đã được ghi lại tại:\n{StartupLog.LogPath}\n\nCó thể gửi file này để kiểm tra nguyên nhân.",
                "King Img",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        catch
        {
            // Không để việc hiện hộp thoại lỗi gây thêm lỗi.
        }
    }

    private sealed record StartupBatchArguments(string? CsvPath, string? TemplatePackagePath)
    {
        public static StartupBatchArguments Parse(string[] args)
        {
            string? csvPath = null;
            string? templatePackagePath = null;

            for (var index = 0; index < args.Length; index++)
            {
                if (args[index].Equals("--batch-csv", StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
                {
                    csvPath = args[++index];
                }
                else if (args[index].Equals("--text-template-preset", StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
                {
                    templatePackagePath = args[++index];
                }
            }

            return new StartupBatchArguments(csvPath, templatePackagePath);
        }
    }
}
