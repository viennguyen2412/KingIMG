using System.Diagnostics;
using System.Drawing.Text;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace KingImg;

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.AutoDual)]
public sealed class KingImgApi
{
    internal const string DefaultPresetsJson = """
    [
      {"id":"facebook-feed","name":"Facebook Feed","mode":"fixed","width":1200,"height":630,"format":"webp","quality":80},
      {"id":"instagram-story","name":"Instagram Story","mode":"fixed","width":1080,"height":1920,"format":"webp","quality":80},
      {"id":"zalo-oa-cover","name":"Zalo OA Cover","mode":"fixed","width":800,"height":800,"format":"webp","quality":85},
      {"id":"blog-thumbnail","name":"Blog Thumbnail","mode":"axis","axis":"width","axisValue":600,"format":"jpeg","quality":85}
    ]
    """;

    private readonly AppPaths paths;

    public KingImgApi(AppPaths paths)
    {
        this.paths = paths;
    }

    public string LoadPresets() => ReadJson(paths.PresetsFile, DefaultPresetsJson);

    public void SavePresets(string json) => WriteJson(paths.PresetsFile, json);

    public string LoadTemplates() => ReadJson(paths.TemplatesFile, "[]");

    public void SaveTemplates(string json) => WriteJson(paths.TemplatesFile, json);

    public string ChooseExportFolder()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Chọn thư mục lưu ảnh xuất ra",
            UseDescriptionForTitle = true
        };

        return dialog.ShowDialog() == DialogResult.OK ? dialog.SelectedPath : string.Empty;
    }

    public string ChooseSourceFolder()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Chọn thư mục chứa ảnh nguồn",
            UseDescriptionForTitle = true
        };

        return dialog.ShowDialog() == DialogResult.OK ? dialog.SelectedPath : string.Empty;
    }

    public string ListImagesInFolder(string folderPath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(folderPath) || !Directory.Exists(folderPath))
            {
                return "[]";
            }

            string[] allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
            var names = Directory.EnumerateFiles(folderPath)
                .Where(file => allowedExtensions.Contains(Path.GetExtension(file), StringComparer.OrdinalIgnoreCase))
                .Select(Path.GetFileName)
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .OrderBy(name => name, StringComparer.CurrentCultureIgnoreCase)
                .ToArray();

            return JsonSerializer.Serialize(names);
        }
        catch
        {
            return "[]";
        }
    }

    public string ReadImageFile(string folderPath, string fileName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(folderPath) || string.IsNullOrWhiteSpace(fileName) || !Directory.Exists(folderPath))
            {
                return string.Empty;
            }

            var safeName = Path.GetFileName(fileName);
            var folderFullPath = Path.GetFullPath(folderPath);
            if (!Path.EndsInDirectorySeparator(folderFullPath))
            {
                folderFullPath += Path.DirectorySeparatorChar;
            }

            var fileFullPath = Path.GetFullPath(Path.Combine(folderFullPath, safeName));
            if (!fileFullPath.StartsWith(folderFullPath, StringComparison.OrdinalIgnoreCase) || !File.Exists(fileFullPath))
            {
                return string.Empty;
            }

            var extension = Path.GetExtension(fileFullPath).ToLowerInvariant();
            if (extension is not ".jpg" and not ".jpeg" and not ".png" and not ".webp")
            {
                return string.Empty;
            }

            return Convert.ToBase64String(File.ReadAllBytes(fileFullPath));
        }
        catch
        {
            return string.Empty;
        }
    }

    public bool SaveFile(string folder, string fileName, string base64Data)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(folder) || string.IsNullOrWhiteSpace(fileName))
            {
                return false;
            }

            Directory.CreateDirectory(folder);
            var safeName = string.Join("_", fileName.Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries)).Trim();
            var commaIndex = base64Data.IndexOf(',');
            var payload = commaIndex >= 0 ? base64Data[(commaIndex + 1)..] : base64Data;
            var bytes = Convert.FromBase64String(payload);
            File.WriteAllBytes(Path.Combine(folder, safeName), bytes);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public void OpenFolder(string path)
    {
        if (Directory.Exists(path))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = path,
                UseShellExecute = true
            });
        }
    }

    public string ListSystemFonts()
    {
        using var fonts = new InstalledFontCollection();
        var names = fonts.Families.Select(f => f.Name).Distinct().OrderBy(n => n).ToArray();
        return JsonSerializer.Serialize(names);
    }

    public string AddCustomFont(string fileName, string base64Data)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension is not ".ttf" and not ".otf")
        {
            return string.Empty;
        }

        Directory.CreateDirectory(paths.CustomFontsDir);
        var safeBase = Path.GetFileNameWithoutExtension(fileName);
        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            safeBase = safeBase.Replace(invalid, '_');
        }

        var safeName = $"{safeBase}-{Guid.NewGuid():N}{extension}";
        var commaIndex = base64Data.IndexOf(',');
        var payload = commaIndex >= 0 ? base64Data[(commaIndex + 1)..] : base64Data;
        File.WriteAllBytes(Path.Combine(paths.CustomFontsDir, safeName), Convert.FromBase64String(payload));

        var registry = JsonNode.Parse(ReadJson(paths.FontRegistryFile, "[]"))?.AsArray() ?? [];
        registry.Add(new JsonObject
        {
            ["name"] = safeBase,
            ["fileName"] = safeName
        });
        WriteJson(paths.FontRegistryFile, registry.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        return safeBase;
    }

    public string ListCustomFonts() => ReadJson(paths.FontRegistryFile, "[]");

    private static string ReadJson(string file, string fallback)
    {
        try
        {
            return File.Exists(file) ? File.ReadAllText(file) : fallback;
        }
        catch
        {
            return fallback;
        }
    }

    private static void WriteJson(string file, string json)
    {
        _ = JsonNode.Parse(json);
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        File.WriteAllText(file, json);
    }
}
