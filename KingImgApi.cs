using System.Diagnostics;
using System.Drawing.Text;
using System.IO.Compression;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PdfSharp.Drawing;
using PdfSharp.Pdf;

namespace KingImg;

[ComVisible(true)]
[ClassInterface(ClassInterfaceType.AutoDual)]
public sealed class KingImgApi
{
    private const string TextTemplatePackageFormat = "kingimg-text-templates";
    private const string GitHubReleasesLatestUrl = "https://api.github.com/repos/viennguyen2412/KingIMG/releases/latest";

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

    public void WriteRuntimeLog(string message) => StartupLog.Write($"renderer: {message}");

    public void SavePresets(string json) => WriteJson(paths.PresetsFile, json);

    public string LoadTemplates() => ReadJson(paths.TemplatesFile, "[]");

    public void SaveTemplates(string json) => WriteJson(paths.TemplatesFile, json);

    public string GetAppVersion() => typeof(KingImgApi).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";

    public async Task<string> CheckForUpdateAsync()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("KingImg-UpdateCheck");
            var json = await http.GetStringAsync(GitHubReleasesLatestUrl);
            var release = JsonNode.Parse(json);
            var tag = release?["tag_name"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(tag))
            {
                return """{"hasUpdate":false}""";
            }

            var latest = tag.TrimStart('v', 'V');
            var hasUpdate = Version.TryParse(latest, out var latestVer)
                && Version.TryParse(GetAppVersion(), out var currentVer)
                && latestVer > currentVer;

            var installerAsset = release?["assets"]?.AsArray()
                .Select(asset => asset?["browser_download_url"]?.GetValue<string>())
                .FirstOrDefault(assetUrl => assetUrl is not null && assetUrl.EndsWith(".exe", StringComparison.OrdinalIgnoreCase));

            var result = new JsonObject
            {
                ["hasUpdate"] = hasUpdate,
                ["latestVersion"] = latest,
                ["url"] = installerAsset
                    ?? release?["html_url"]?.GetValue<string>()
                    ?? $"https://github.com/viennguyen2412/KingIMG/releases/tag/{tag}"
            };
            return result.ToJsonString();
        }
        catch
        {
            return """{"hasUpdate":false}""";
        }
    }

    public string ExportTextTemplatePackage(string templatesJson)
    {
        try
        {
            var templates = JsonNode.Parse(templatesJson)?.AsArray();
            if (templates is null)
            {
                return string.Empty;
            }

            using var dialog = new SaveFileDialog
            {
                Title = "Xuất preset chèn text",
                Filter = "King Img text presets (*.kimgtpl)|*.kimgtpl",
                DefaultExt = "kimgtpl",
                FileName = "kingimg-text-presets.kimgtpl",
                AddExtension = true
            };

            if (dialog.ShowDialog() != DialogResult.OK)
            {
                return string.Empty;
            }

            var requestedFonts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var template in templates)
            {
                foreach (var slot in template?["slots"]?.AsArray() ?? [])
                {
                    var fontName = JsonString(slot?["fontFamily"]);
                    if (!string.IsNullOrWhiteSpace(fontName))
                    {
                        requestedFonts.Add(fontName);
                    }
                }
            }

            var includedFonts = new JsonArray();
            var fontFiles = new List<(string FileName, string FullPath)>();
            var registeredFonts = JsonNode.Parse(ReadJson(paths.FontRegistryFile, "[]"))?.AsArray() ?? [];
            var addedFontNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var font in registeredFonts)
            {
                var fontName = JsonString(font?["name"]);
                var fileName = JsonString(font?["fileName"]);
                if (!requestedFonts.Contains(fontName) || !addedFontNames.Add(fontName) || !IsSafeFontFileName(fileName))
                {
                    continue;
                }

                var fullPath = Path.Combine(paths.CustomFontsDir, fileName);
                if (!File.Exists(fullPath))
                {
                    continue;
                }

                includedFonts.Add(new JsonObject
                {
                    ["name"] = fontName,
                    ["fileName"] = fileName
                });
                fontFiles.Add((fileName, fullPath));
            }

            var package = new JsonObject
            {
                ["format"] = TextTemplatePackageFormat,
                ["version"] = 1,
                ["templates"] = templates.DeepClone(),
                ["fonts"] = includedFonts
            };

            using (var stream = File.Create(dialog.FileName))
            using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
            {
                WriteZipText(archive, "templates.json", package.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
                foreach (var fontFile in fontFiles)
                {
                    var entry = archive.CreateEntry($"fonts/{fontFile.FileName}", CompressionLevel.Optimal);
                    using var source = File.OpenRead(fontFile.FullPath);
                    using var target = entry.Open();
                    source.CopyTo(target);
                }
            }

            return JsonSerializer.Serialize(new
            {
                path = dialog.FileName,
                templateCount = templates.Count,
                fontCount = fontFiles.Count
            });
        }
        catch
        {
            return string.Empty;
        }
    }

    public string ImportTextTemplatePackage()
    {
        try
        {
            using var dialog = new OpenFileDialog
            {
                Title = "Nhập preset chèn text",
                Filter = "King Img text presets (*.kimgtpl)|*.kimgtpl",
                Multiselect = false
            };

            if (dialog.ShowDialog() != DialogResult.OK)
            {
                return string.Empty;
            }

            using var archive = ZipFile.OpenRead(dialog.FileName);
            var packageEntry = archive.GetEntry("templates.json");
            if (packageEntry is null)
            {
                return string.Empty;
            }

            var package = JsonNode.Parse(ReadZipText(packageEntry))?.AsObject();
            if (package is null || !string.Equals(JsonString(package["format"]), TextTemplatePackageFormat, StringComparison.Ordinal))
            {
                return string.Empty;
            }

            var templates = package["templates"]?.AsArray();
            if (templates is null)
            {
                return string.Empty;
            }

            var registry = JsonNode.Parse(ReadJson(paths.FontRegistryFile, "[]"))?.AsArray() ?? [];
            var registeredNames = new HashSet<string>(
                registry.Select(font => JsonString(font?["name"])).Where(name => !string.IsNullOrWhiteSpace(name)),
                StringComparer.OrdinalIgnoreCase);
            var importedFontCount = 0;

            foreach (var font in package["fonts"]?.AsArray() ?? [])
            {
                var fontName = JsonString(font?["name"]);
                var sourceFileName = JsonString(font?["fileName"]);
                if (string.IsNullOrWhiteSpace(fontName) || registeredNames.Contains(fontName) || !IsSafeFontFileName(sourceFileName))
                {
                    continue;
                }

                var entry = archive.GetEntry($"fonts/{sourceFileName}");
                if (entry is null || entry.Length == 0)
                {
                    continue;
                }

                var extension = Path.GetExtension(sourceFileName).ToLowerInvariant();
                var safeBase = Path.GetFileNameWithoutExtension(sourceFileName);
                var destinationFileName = $"{safeBase}-{Guid.NewGuid():N}{extension}";
                var destinationPath = Path.Combine(paths.CustomFontsDir, destinationFileName);
                Directory.CreateDirectory(paths.CustomFontsDir);

                using (var source = entry.Open())
                using (var target = File.Create(destinationPath))
                {
                    source.CopyTo(target);
                }

                registry.Add(new JsonObject
                {
                    ["name"] = fontName,
                    ["fileName"] = destinationFileName
                });
                registeredNames.Add(fontName);
                importedFontCount++;
            }

            if (importedFontCount > 0)
            {
                WriteJson(paths.FontRegistryFile, registry.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            }

            return new JsonObject
            {
                ["templates"] = templates.DeepClone(),
                ["fontCount"] = importedFontCount
            }.ToJsonString();
        }
        catch
        {
            return string.Empty;
        }
    }

    public string LoadTextTemplatePackageFromPath(string packagePath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(packagePath) || !File.Exists(packagePath) || !string.Equals(Path.GetExtension(packagePath), ".kimgtpl", StringComparison.OrdinalIgnoreCase))
            {
                return string.Empty;
            }

            using var archive = ZipFile.OpenRead(packagePath);
            var packageEntry = archive.GetEntry("templates.json");
            if (packageEntry is null)
            {
                return string.Empty;
            }

            var package = JsonNode.Parse(ReadZipText(packageEntry))?.AsObject();
            if (package is null || !string.Equals(JsonString(package["format"]), TextTemplatePackageFormat, StringComparison.Ordinal))
            {
                return string.Empty;
            }

            var templates = package["templates"]?.AsArray();
            if (templates is null)
            {
                return string.Empty;
            }

            return new JsonObject
            {
                ["templates"] = templates.DeepClone(),
                ["fontCount"] = 0
            }.ToJsonString();
        }
        catch
        {
            return string.Empty;
        }
    }

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

    public string ChooseBatchCsvFile()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Chon file CSV batch",
            Filter = "CSV files (*.csv)|*.csv|Text files (*.txt)|*.txt|All files (*.*)|*.*",
            Multiselect = false
        };

        if (dialog.ShowDialog() != DialogResult.OK)
        {
            return string.Empty;
        }

        try
        {
            var filePath = Path.GetFullPath(dialog.FileName);
            var folder = Path.GetDirectoryName(filePath) ?? string.Empty;
            return JsonSerializer.Serialize(new
            {
                path = filePath,
                fileName = Path.GetFileName(filePath),
                folder,
                text = File.ReadAllText(filePath)
            });
        }
        catch
        {
            return string.Empty;
        }
    }

    public string LoadBatchCsvFileFromPath(string csvPath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(csvPath) || !File.Exists(csvPath) || !string.Equals(Path.GetExtension(csvPath), ".csv", StringComparison.OrdinalIgnoreCase))
            {
                return string.Empty;
            }

            var filePath = Path.GetFullPath(csvPath);
            return JsonSerializer.Serialize(new
            {
                path = filePath,
                fileName = Path.GetFileName(filePath),
                folder = Path.GetDirectoryName(filePath) ?? string.Empty,
                text = File.ReadAllText(filePath)
            });
        }
        catch
        {
            return string.Empty;
        }
    }

    public string OverwriteBatchCsv(string csvPath, string csvText)
    {
        string? temporaryPath = null;
        try
        {
            if (string.IsNullOrWhiteSpace(csvPath) ||
                !string.Equals(Path.GetExtension(csvPath), ".csv", StringComparison.OrdinalIgnoreCase))
            {
                return JsonSerializer.Serialize(new { success = false, error = "Đường dẫn CSV không hợp lệ." });
            }

            var filePath = Path.GetFullPath(csvPath);
            if (!File.Exists(filePath))
            {
                return JsonSerializer.Serialize(new { success = false, error = "Không tìm thấy file CSV gốc." });
            }

            var backupPath = filePath + ".bak";
            temporaryPath = filePath + ".tmp-" + Guid.NewGuid().ToString("N");
            File.WriteAllText(temporaryPath, csvText ?? string.Empty, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            File.Copy(filePath, backupPath, overwrite: true);
            File.Move(temporaryPath, filePath, overwrite: true);
            temporaryPath = null;

            return JsonSerializer.Serialize(new
            {
                success = true,
                filePath,
                backupPath
            });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new
            {
                success = false,
                error = ex.Message
            });
        }
        finally
        {
            if (!string.IsNullOrWhiteSpace(temporaryPath))
            {
                try
                {
                    if (File.Exists(temporaryPath))
                    {
                        File.Delete(temporaryPath);
                    }
                }
                catch
                {
                    // Không che mất lỗi ghi CSV gốc.
                }
            }
        }
    }

    public string EnsureTextOutputFolder(string sourceFolder)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(sourceFolder) || !Directory.Exists(sourceFolder))
            {
                return string.Empty;
            }

            var textRoot = Path.Combine(Path.GetFullPath(sourceFolder), "Text");
            var runName = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss");
            var outputFolder = Path.Combine(textRoot, runName);
            var suffix = 2;
            while (Directory.Exists(outputFolder))
            {
                outputFolder = Path.Combine(textRoot, $"{runName}_{suffix}");
                suffix++;
            }
            Directory.CreateDirectory(outputFolder);
            return outputFolder;
        }
        catch
        {
            return string.Empty;
        }
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

    public bool FileExists(string folder, string fileName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(folder) || string.IsNullOrWhiteSpace(fileName) || !Directory.Exists(folder))
            {
                return false;
            }

            var safeName = Path.GetFileName(fileName);
            var folderFullPath = Path.GetFullPath(folder);
            if (!Path.EndsInDirectorySeparator(folderFullPath))
            {
                folderFullPath += Path.DirectorySeparatorChar;
            }

            var fileFullPath = Path.GetFullPath(Path.Combine(folderFullPath, safeName));
            if (!fileFullPath.StartsWith(folderFullPath, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            return File.Exists(fileFullPath);
        }
        catch
        {
            return false;
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

    public string ChooseSavePdfFile()
    {
        using var dialog = new SaveFileDialog
        {
            Title = "Lưu file PDF",
            Filter = "PDF files (*.pdf)|*.pdf",
            DefaultExt = "pdf",
            FileName = "ghep-anh.pdf",
            AddExtension = true
        };

        return dialog.ShowDialog() == DialogResult.OK ? dialog.FileName : string.Empty;
    }

    public bool MergeImagesToPdf(string imagesJson, string outputPath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(outputPath))
            {
                return false;
            }

            var items = JsonNode.Parse(imagesJson)?.AsArray();
            if (items is null || items.Count == 0)
            {
                return false;
            }

            const double pointsPerPixel = 72.0 / 96.0;

            using var document = new PdfDocument();
            foreach (var item in items)
            {
                var base64 = item?["base64"]?.GetValue<string>() ?? string.Empty;
                var commaIndex = base64.IndexOf(',');
                var payload = commaIndex >= 0 ? base64[(commaIndex + 1)..] : base64;
                if (string.IsNullOrWhiteSpace(payload))
                {
                    continue;
                }

                var bytes = Convert.FromBase64String(payload);
                using var stream = new MemoryStream(bytes);
                using var image = XImage.FromStream(stream);

                var page = document.AddPage();
                page.Width = XUnit.FromPoint(image.PixelWidth * pointsPerPixel);
                page.Height = XUnit.FromPoint(image.PixelHeight * pointsPerPixel);

                using var gfx = XGraphics.FromPdfPage(page);
                gfx.DrawImage(image, 0, 0, page.Width.Point, page.Height.Point);
            }

            if (document.PageCount == 0)
            {
                return false;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);
            document.Save(outputPath);
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

    public void OpenExternalUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            Process.Start(new ProcessStartInfo { FileName = uri.ToString(), UseShellExecute = true });
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

    private static string JsonString(JsonNode? node)
    {
        try
        {
            return node?.GetValue<string>() ?? string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static bool IsSafeFontFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName) || !string.Equals(fileName, Path.GetFileName(fileName), StringComparison.Ordinal))
        {
            return false;
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        return extension is ".ttf" or ".otf";
    }

    private static void WriteZipText(ZipArchive archive, string entryName, string content)
    {
        var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        writer.Write(content);
    }

    private static string ReadZipText(ZipArchiveEntry entry)
    {
        using var reader = new StreamReader(entry.Open(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        return reader.ReadToEnd();
    }

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
