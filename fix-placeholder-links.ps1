$path = 'C:\Users\orest\Desktop\PAPA\MedicalPlatform\igor.html'
$backup = 'C:\Users\orest\Desktop\PAPA\MedicalPlatform\igor.backup-before-placeholder-links-20261012.html'
Copy-Item -LiteralPath $path -Destination $backup -Force
$encoding = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $encoding)
$text = $text.Replace('<a class="logo" href="#">', '<a class="logo" href="/">')
$text = $text.Replace('<a href="#">Врачам</a>', '<a href="/doctor">Врачам</a>')
$text = $text.Replace('<a href="#">Клиникам</a>', '<a href="/support">Клиникам</a>')
$text = $text.Replace('<a href="#">Контакты</a>', '<a href="/support">Контакты</a>')
$text = $text.Replace('<a href="#">Лицензия</a>', '<a href="/documents">Лицензия</a>')
$text = $text.Replace('<a href="#">Политика конфиденциальности</a>', '<a href="/documents">Политика конфиденциальности</a>')
$text = $text.Replace('<a href="#">Пользовательское соглашение</a>', '<a href="/documents">Пользовательское соглашение</a>')
$text = $text.Replace('<a href="#">Оферта</a>', '<a href="/documents">Оферта</a>')
[System.IO.File]::WriteAllText($path, $text, $encoding)
Write-Output 'PATCHED placeholder links'
Write-Output "BACKUP $backup"
