namespace KingImg;

internal static class StartupLog
{
    private static string LogPath => Path.Combine(AppPaths.PortableDataDir, "startup.log");

    internal static void Write(string message, Exception? ex = null)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            var detail = ex is null ? string.Empty : $" {ex}";
            File.AppendAllText(LogPath, $"[{DateTime.UtcNow:o}] {message}{detail}{Environment.NewLine}");
        }
        catch
        {
            // Ghi log không được làm app không mở được.
        }
    }
}
