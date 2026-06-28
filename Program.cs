using System.Diagnostics;
using Microsoft.Web.WebView2.Core;

namespace KingImg;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        try
        {
            _ = CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch
        {
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

        Application.Run(new MainForm());
    }
}
