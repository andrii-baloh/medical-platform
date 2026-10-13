$path = 'C:\Users\orest\Desktop\PAPA\MedicalPlatform\igor.html'
$backup = 'C:\Users\orest\Desktop\PAPA\MedicalPlatform\igor.backup-before-booking-button-fix-20261012.html'
Copy-Item -LiteralPath $path -Destination $backup -Force
$encoding = New-Object System.Text.UTF8Encoding($false)
$text = [System.IO.File]::ReadAllText($path, $encoding)
$old1 = @'
  // Route every visual CTA into the real application workflow.
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-book]");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const slug = target.dataset.slug;
    location.href = slug ? `/book/${encodeURIComponent(slug)}` : "/doctors";
  }, true);
'@
$new1 = @'
  // Demo landing: keep visual CTAs on this page and let the original modal workflow handle [data-book].
'@
$old2 = @'
  const ctaForm = document.querySelector("#ctaForm");
  if (ctaForm) {
    ctaForm.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.href = "/doctors";
    }, true);
    const tel = document.querySelector("#ctaTel");
    if (tel) tel.type = "hidden";
    const label = ctaForm.querySelector("label");
    if (label) label.textContent = "Запись проходит в защищённом кабинете";
    const button = ctaForm.querySelector("button[type=submit]");
    if (button) button.innerHTML = `Выбрать врача <svg class="icon"><use href="#i-arr"/></svg>`;
    const note = ctaForm.querySelector(".cta-note");
    if (note) note.textContent = "Выберите специалиста, свободное время и профиль пациента. После записи консультация появится в личном кабинете.";
  }
'@
$new2 = @'
  // Demo landing: leave the callback form managed by the base script above.
'@
if (-not $text.Contains($old1)) { throw 'Booking click redirect block not found' }
if (-not $text.Contains($old2)) { throw 'CTA form redirect block not found' }
$text = $text.Replace($old1, $new1).Replace($old2, $new2)
[System.IO.File]::WriteAllText($path, $text, $encoding)
Write-Output 'PATCHED booking button modal behavior'
Write-Output "BACKUP $backup"
