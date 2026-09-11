using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.VisualBasic.FileIO;

namespace KingImg;

internal sealed record BatchRunResult(string OutputFolder, int FileCount);

internal static class BatchTextRenderer
{
    private const string PackageFormat = "kingimg-text-templates";

    public static BatchRunResult Run(string csvPath, string? packagePath, AppPaths paths)
    {
        if (string.IsNullOrWhiteSpace(csvPath) || !File.Exists(csvPath))
        {
            throw new InvalidOperationException("Không tìm thấy CSV batch.");
        }

        if (string.IsNullOrWhiteSpace(packagePath) || !File.Exists(packagePath))
        {
            throw new InvalidOperationException("Không tìm thấy preset chèn text.");
        }

        var templates = LoadTemplates(packagePath);
        var rows = ReadCsv(csvPath);
        var sourceFolder = Path.GetDirectoryName(Path.GetFullPath(csvPath))
            ?? throw new InvalidOperationException("Không xác định được thư mục ảnh nguồn.");
        var groups = BuildGroups(rows, templates, sourceFolder);
        var outputFolder = CreateTimestampedOutputFolder(sourceFolder);

        using var fontCollection = LoadBundledFonts(paths.BundledFontsDir);
        foreach (var group in groups)
        {
            RenderOutputGroup(group, outputFolder, fontCollection);
        }

        return new BatchRunResult(outputFolder, groups.Count);
    }

    private static List<TemplateDefinition> LoadTemplates(string packagePath)
    {
        using var archive = ZipFile.OpenRead(packagePath);
        var entry = archive.GetEntry("templates.json")
            ?? throw new InvalidOperationException("Preset không có templates.json.");
        using var reader = new StreamReader(entry.Open(), Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var package = JsonNode.Parse(reader.ReadToEnd())?.AsObject()
            ?? throw new InvalidOperationException("Preset không đọc được.");
        if (!string.Equals(GetString(package["format"]), PackageFormat, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Preset không đúng định dạng King Img.");
        }

        var result = new List<TemplateDefinition>();
        foreach (var rawTemplate in package["templates"]?.AsArray() ?? [])
        {
            if (rawTemplate is not JsonObject template)
            {
                continue;
            }

            var name = GetString(template["name"]);
            var canvasW = GetInt(template["canvasW"]);
            var canvasH = GetInt(template["canvasH"]);
            if (string.IsNullOrWhiteSpace(name) || canvasW <= 0 || canvasH <= 0)
            {
                continue;
            }

            var slots = new List<SlotDefinition>();
            foreach (var rawSlot in template["slots"]?.AsArray() ?? [])
            {
                if (rawSlot is not JsonObject slot)
                {
                    continue;
                }

                var label = GetString(slot["label"]);
                if (string.IsNullOrWhiteSpace(label))
                {
                    continue;
                }

                var background = slot["background"]?.AsObject();
                slots.Add(new SlotDefinition(
                    label,
                    GetFloat(slot["x"]),
                    GetFloat(slot["y"]),
                    GetFloat(slot["width"]),
                    GetFloat(slot["height"]),
                    GetFloat(slot["fontSize"]),
                    GetString(slot["color"], "#000000"),
                    GetString(slot["align"], "left"),
                    GetString(slot["verticalAlign"], "top"),
                    GetString(slot["fontFamily"], "Segoe UI"),
                    GetBool(slot["bold"]),
                    GetBool(slot["italic"]),
                    GetBool(slot["underline"]),
                    GetBool(background?["enabled"]),
                    GetString(background?["shape"], "rect"),
                    GetString(background?["color"], "#000000"),
                    GetInt(background?["opacity"], 45)));
            }

            result.Add(new TemplateDefinition(name, canvasW, canvasH, slots));
        }

        if (result.Count == 0)
        {
            throw new InvalidOperationException("Preset không có mẫu hợp lệ.");
        }

        return result;
    }

    private static List<BatchRow> ReadCsv(string csvPath)
    {
        using var parser = new TextFieldParser(csvPath, Encoding.UTF8, detectEncoding: true)
        {
            TextFieldType = FieldType.Delimited,
            HasFieldsEnclosedInQuotes = true,
            TrimWhiteSpace = false
        };
        parser.SetDelimiters(",");
        var headers = parser.ReadFields() ?? throw new InvalidOperationException("CSV không có header.");
        var positions = headers
            .Select((value, index) => new { Name = (value ?? string.Empty).TrimStart('\uFEFF').Trim().ToLowerInvariant(), index })
            .ToDictionary(item => item.Name, item => item.index, StringComparer.Ordinal);
        var required = new[] { "ten_anh", "ten_mau", "ten_vi_tri", "noi_dung" };
        if (required.Any(name => !positions.ContainsKey(name)))
        {
            throw new InvalidOperationException("CSV thiếu một hoặc nhiều cột bắt buộc.");
        }

        var rows = new List<BatchRow>();
        while (!parser.EndOfData)
        {
            var fields = parser.ReadFields();
            if (fields is null || fields.All(string.IsNullOrWhiteSpace))
            {
                continue;
            }

            string GetField(string name) => positions[name] < fields.Length ? fields[positions[name]] ?? string.Empty : string.Empty;
            rows.Add(new BatchRow(GetField("ten_anh"), GetField("ten_mau"), GetField("ten_vi_tri"), GetField("noi_dung")));
        }

        if (rows.Count == 0)
        {
            throw new InvalidOperationException("CSV chưa có dòng dữ liệu.");
        }

        return rows;
    }

    private static List<RenderGroup> BuildGroups(List<BatchRow> rows, List<TemplateDefinition> templates, string sourceFolder)
    {
        var templateLookup = templates.ToDictionary(template => template.Name, StringComparer.Ordinal);
        var fileLookup = Directory.EnumerateFiles(sourceFolder)
            .Where(path => Path.GetExtension(path).Equals(".png", StringComparison.OrdinalIgnoreCase)
                        || Path.GetExtension(path).Equals(".jpg", StringComparison.OrdinalIgnoreCase)
                        || Path.GetExtension(path).Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
                        || Path.GetExtension(path).Equals(".webp", StringComparison.OrdinalIgnoreCase))
            .ToDictionary(path => Path.GetFileName(path), path => path, StringComparer.OrdinalIgnoreCase);
        var errors = new List<string>();
        var groups = new Dictionary<string, RenderGroup>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in rows)
        {
            if (!fileLookup.TryGetValue(row.ImageName, out var imagePath))
            {
                errors.Add($"Không tìm thấy ảnh nguồn: {row.ImageName}.");
                continue;
            }
            if (!templateLookup.TryGetValue(row.TemplateName, out var template))
            {
                errors.Add($"Không tìm thấy mẫu: {row.TemplateName}.");
                continue;
            }
            if (!template.Slots.Any(slot => string.Equals(slot.Label, row.SlotLabel, StringComparison.Ordinal)))
            {
                errors.Add($"Mẫu {row.TemplateName} không có vị trí {row.SlotLabel}.");
                continue;
            }

            if (!groups.TryGetValue(row.ImageName, out var group))
            {
                group = new RenderGroup(row.ImageName, imagePath, template, new Dictionary<string, string>(StringComparer.Ordinal));
                groups.Add(row.ImageName, group);
            }
            else if (!string.Equals(group.Template.Name, template.Name, StringComparison.Ordinal))
            {
                errors.Add($"Ảnh {row.ImageName} được gán nhiều mẫu khác nhau.");
                continue;
            }

            group.TextBySlot[row.SlotLabel] = row.Text;
        }

        foreach (var group in groups.Values)
        {
            using var image = Image.FromFile(group.ImagePath);
            if (image.Width != group.Template.CanvasW || image.Height != group.Template.CanvasH)
            {
                errors.Add($"Ảnh {group.ImageName} là {image.Width}×{image.Height}px, không khớp mẫu {group.Template.CanvasW}×{group.Template.CanvasH}px.");
            }
        }

        if (errors.Count > 0)
        {
            throw new InvalidOperationException(string.Join(Environment.NewLine, errors.Distinct(StringComparer.Ordinal).Take(12)));
        }

        return groups.Values.OrderBy(group => group.ImageName, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string CreateTimestampedOutputFolder(string sourceFolder)
    {
        var textRoot = Path.Combine(sourceFolder, "Text");
        var runName = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture);
        var candidate = Path.Combine(textRoot, runName);
        var suffix = 2;
        while (Directory.Exists(candidate))
        {
            candidate = Path.Combine(textRoot, $"{runName}_{suffix}");
            suffix++;
        }

        Directory.CreateDirectory(candidate);
        return candidate;
    }

    private static PrivateFontCollection LoadBundledFonts(string fontDirectory)
    {
        var collection = new PrivateFontCollection();
        if (!Directory.Exists(fontDirectory))
        {
            return collection;
        }

        foreach (var fontPath in Directory.EnumerateFiles(fontDirectory, "*.ttf"))
        {
            try
            {
                collection.AddFontFile(fontPath);
            }
            catch
            {
                // A bad bundled font must not stop a text batch that can use available fonts.
            }
        }

        return collection;
    }

    private static void RenderOutputGroup(RenderGroup group, string outputFolder, PrivateFontCollection fontCollection)
    {
        using var source = Image.FromFile(group.ImagePath);
        using var output = new Bitmap(group.Template.CanvasW, group.Template.CanvasH, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(output);
        graphics.Clear(Color.Transparent);
        graphics.CompositingMode = CompositingMode.SourceCopy;
        graphics.DrawImage(source, new Rectangle(0, 0, output.Width, output.Height));
        graphics.CompositingMode = CompositingMode.SourceOver;
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

        foreach (var slot in group.Template.Slots)
        {
            if (group.TextBySlot.TryGetValue(slot.Label, out var text))
            {
                DrawSlot(graphics, slot, text, fontCollection);
            }
        }

        var baseName = Path.GetFileNameWithoutExtension(group.ImageName);
        var fileName = SanitizeFileName($"{group.Template.Name}_{baseName}.png");
        output.Save(Path.Combine(outputFolder, fileName), ImageFormat.Png);
    }

    private static void DrawSlot(Graphics graphics, SlotDefinition slot, string text, PrivateFontCollection fontCollection)
    {
        var style = FontStyle.Regular;
        if (slot.Bold) style |= FontStyle.Bold;
        if (slot.Italic) style |= FontStyle.Italic;
        if (slot.Underline) style |= FontStyle.Underline;
        using var font = CreateFont(slot.FontFamily, slot.FontSize, style, fontCollection);
        using var brush = new SolidBrush(ParseColor(slot.Color));
        using var format = new StringFormat()
        {
            Alignment = slot.Align.ToLowerInvariant() switch
            {
                "center" => StringAlignment.Center,
                "right" => StringAlignment.Far,
                _ => StringAlignment.Near
            },
            LineAlignment = StringAlignment.Near,
            Trimming = StringTrimming.None,
            FormatFlags = StringFormatFlags.LineLimit
        };

        // Draw only the space the text actually occupies. This keeps a note panel balanced
        // for both short and long notes, and keeps the native batch output aligned with the
        // in-app preview instead of painting a fixed, often over-wide background rectangle.
        var textBounds = graphics.MeasureString(text, font, new SizeF(slot.Width, slot.Height), format);
        var blockWidth = Math.Min(slot.Width, Math.Max(1, textBounds.Width));
        var blockHeight = Math.Min(slot.Height, Math.Max(1, textBounds.Height));
        var blockX = slot.Align.ToLowerInvariant() switch
        {
            "center" => slot.X + (slot.Width - blockWidth) / 2,
            "right" => slot.X + slot.Width - blockWidth,
            _ => slot.X
        };
        var blockY = slot.VerticalAlign.ToLowerInvariant() switch
        {
            "top" => slot.Y,
            "bottom" => slot.Y + Math.Max(0, slot.Height - blockHeight),
            _ => slot.Y + Math.Max(0, (slot.Height - blockHeight) / 2)
        };
        var textRectangle = new RectangleF(blockX, blockY, blockWidth, blockHeight);

        if (slot.BackgroundEnabled)
        {
            const float paddingX = 12;
            const float paddingY = 8;
            using var background = new SolidBrush(WithOpacity(ParseColor(slot.BackgroundColor), slot.BackgroundOpacity));
            if (slot.BackgroundShape.Equals("circle", StringComparison.OrdinalIgnoreCase))
            {
                // A page-number badge must be a real circle. Center it in the preset slot,
                // not in the glyph's variable bounds (which differ for 1, 10, 11, 12, ...).
                var diameter = Math.Min(slot.Width, slot.Height);
                var circle = new RectangleF(
                    slot.X + (slot.Width - diameter) / 2,
                    slot.Y + (slot.Height - diameter) / 2,
                    diameter,
                    diameter);
                graphics.FillEllipse(background, circle);
            }
            else
            {
                graphics.FillRectangle(background, new RectangleF(
                    Math.Max(slot.X, blockX - paddingX),
                    Math.Max(slot.Y, blockY - paddingY),
                    Math.Min(slot.Width, blockWidth + paddingX * 2),
                    Math.Min(slot.Height, blockHeight + paddingY * 2)));
            }
        }

        graphics.DrawString(text, font, brush, textRectangle, format);
    }

    private static Font CreateFont(string requestedFamily, float size, FontStyle requestedStyle, PrivateFontCollection fontCollection)
    {
        var family = fontCollection.Families.FirstOrDefault(item => string.Equals(item.Name, requestedFamily, StringComparison.OrdinalIgnoreCase));
        try
        {
            family ??= new FontFamily(requestedFamily);
        }
        catch
        {
            family = FontFamily.GenericSansSerif;
        }

        var style = family.IsStyleAvailable(requestedStyle) ? requestedStyle : FontStyle.Regular;
        return new Font(family, Math.Max(1, size), style, GraphicsUnit.Pixel);
    }

    private static string SanitizeFileName(string value)
    {
        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            var replacement = character switch { 'đ' => 'd', 'Đ' => 'D', _ => character };
            if (char.IsWhiteSpace(replacement))
            {
                builder.Append('-');
            }
            else if (char.IsLetterOrDigit(replacement) || replacement is '.' or '-' or '_')
            {
                builder.Append(replacement);
            }
        }

        return builder.ToString();
    }

    private static string GetString(JsonNode? value, string fallback = "")
    {
        try { return value?.GetValue<string>() ?? fallback; }
        catch { return fallback; }
    }

    private static int GetInt(JsonNode? value, int fallback = 0)
    {
        try { return value?.GetValue<int>() ?? fallback; }
        catch { return fallback; }
    }

    private static float GetFloat(JsonNode? value, float fallback = 0)
    {
        try { return value?.GetValue<float>() ?? fallback; }
        catch { return fallback; }
    }

    private static bool GetBool(JsonNode? value) => value is not null && value.GetValue<bool>();

    private static Color ParseColor(string value)
    {
        try { return ColorTranslator.FromHtml(value); }
        catch { return Color.Black; }
    }

    private static Color WithOpacity(Color color, int opacity) => Color.FromArgb(Math.Clamp(opacity, 0, 100) * 255 / 100, color);

    private sealed record BatchRow(string ImageName, string TemplateName, string SlotLabel, string Text);
    private sealed record TemplateDefinition(string Name, int CanvasW, int CanvasH, List<SlotDefinition> Slots);
    private sealed record SlotDefinition(string Label, float X, float Y, float Width, float Height, float FontSize, string Color, string Align, string VerticalAlign, string FontFamily, bool Bold, bool Italic, bool Underline, bool BackgroundEnabled, string BackgroundShape, string BackgroundColor, int BackgroundOpacity);
    private sealed record RenderGroup(string ImageName, string ImagePath, TemplateDefinition Template, Dictionary<string, string> TextBySlot);
}
