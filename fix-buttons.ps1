$path = 'C:\Users\orest\Desktop\PAPA\MedicalPlatform\igor.html'
$backup = 'C:\Users\orest\Desktop\PAPA\MedicalPlatform\igor.backup-before-buttons-audit-20261012.html'
Copy-Item -LiteralPath $path -Destination $backup -Force
$encoding = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $encoding)

$patternBook = '(?s)\r?\n  // Route every visual CTA into the real application workflow\.\r?\n  document\.addEventListener\("click", \(event\) => \{.*?\r?\n  \}, true\);\r?\n'
$replacementBook = "`r`n  // Demo landing: keep visual CTAs on this page and let the original modal workflow handle [data-book].`r`n"
$text2 = [regex]::Replace($text, $patternBook, $replacementBook, 1)
if ($text2 -eq $text) { throw 'Booking redirect interceptor was not replaced' }
$text = $text2

$patternCta = '(?s)\r?\n  const ctaForm = document\.querySelector\("#ctaForm"\);\r?\n  if \(ctaForm\) \{.*?\r?\n  \}\r?\n\r?\n  // Keep the original visual'
$replacementCta = "`r`n  // Demo landing: leave the callback form managed by the base script above.`r`n`r`n  // Keep the original visual"
$text = [regex]::Replace($text, $patternCta, $replacementCta, 1)

[System.IO.File]::WriteAllText($path, $text, $encoding)
Write-Output 'PATCHED buttons: booking modal restored, callback form no longer redirected'
Write-Output "BACKUP $backup"
