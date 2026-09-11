# Huong dan keo repo KingIMG tu GitHub

Repo GitHub:

```text
https://github.com/viennguyen2412/KingIMG
```

Thu muc tren may:

```text
C:\Users\nguye\Downloads\King Img
```

## Khi nao dung file nay

Dung khi Codex khong tu keo duoc repo private vi Git credential cua anh nam o user Windows chinh, con Codex chay trong user sandbox rieng.

## Cach lam an toan

1. Mo PowerShell thuong cua Windows.

2. Di vao thu muc du an:

```powershell
cd "C:\Users\nguye\Downloads\King Img"
```

3. Kiem tra Git dang tro dung repo:

```powershell
git remote -v
```

Neu chua thay `origin https://github.com/viennguyen2412/KingIMG.git`, chay:

```powershell
git remote add origin https://github.com/viennguyen2412/KingIMG.git
```

Neu bao remote da ton tai nhung sai link, chay:

```powershell
git remote set-url origin https://github.com/viennguyen2412/KingIMG.git
```

4. Dang nhap GitHub cho Git Credential Manager neu Git yeu cau:

```powershell
git credential-manager github login
```

Lam theo trinh duyet/man hinh xac nhan hien ra.

5. Tai lich su repo ve may:

```powershell
git fetch origin main
```

6. Noi thu muc hien tai voi nhanh `main` tren GitHub ma chua ghi de file:

```powershell
git reset --mixed origin/main
```

7. Kiem tra trang thai:

```powershell
git status
```

Neu thay `working tree clean` hoac chi co thay doi anh biet ro, la da ket noi thanh cong.

## Sau nay muon keo cap nhat moi

Sau khi da ket noi thanh cong, moi lan can cap nhat tu GitHub:

```powershell
cd "C:\Users\nguye\Downloads\King Img"
git pull origin main
```

## Neu Git bao bi chan do file local

Dung xoa voi. Tao ban backup truoc:

```powershell
cd "C:\Users\nguye\Downloads"
Copy-Item -Recurse -Force "King Img" "King Img backup before git pull"
```

Sau khi co backup, quay lai thu muc du an:

```powershell
cd "C:\Users\nguye\Downloads\King Img"
git status
```

Neu anh muon lay y nguyen ban tren GitHub va chap nhan bo thay doi local, chay:

```powershell
git reset --hard origin/main
```

Lenh tren se ghi de thay doi local, nen chi dung sau khi da backup.

## Ghi chu hien tai

Codex da tao lai `.git` moi va gan remote `origin` toi repo KingIMG. Thu muc `.git` cu bi loi quyen ghi va dang duoc giu lai duoi ten:

```text
.git-broken-empty-20260630
```

Thu muc cu nay rong va chi de tham chieu neu can kiem tra lai.
