param()

$ErrorActionPreference = 'Stop'
$version = '3.97.4'
$assetName = "trufflehog_${version}_windows_amd64.tar.gz"
$releaseUrl = "https://github.com/trufflesecurity/trufflehog/releases/download/v$version"
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$installPath = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tools/trufflehog'))

if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    throw 'Cet installeur cible Windows AMD64 uniquement.'
}
if (-not $installPath.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Le chemin installation doit rester dans le projet.'
}
Get-Command tar.exe -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
$archivePath = Join-Path $installPath "download-$([Guid]::NewGuid()).tar.gz"
$checksumsPath = Join-Path $installPath "checksums-$([Guid]::NewGuid()).txt"

try {
    Invoke-WebRequest -Uri "$releaseUrl/$assetName" -OutFile $archivePath
    Invoke-WebRequest -Uri "$releaseUrl/trufflehog_${version}_checksums.txt" -OutFile $checksumsPath
    $checksumLine = @(Get-Content -LiteralPath $checksumsPath | Where-Object {
        $_ -match ('^[a-fA-F0-9]{64}\s+\*?' + [Regex]::Escape($assetName) + '$')
    })
    if ($checksumLine.Count -ne 1) {
        throw 'Somme SHA256 absente ou ambiguë dans le manifeste de release.'
    }
    $expectedHash = ($checksumLine[0] -split '\s+')[0]
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) {
        throw 'La somme SHA256 téléchargée ne correspond pas au manifeste.'
    }

    # Extraire uniquement le binaire attendu, jamais toute une arborescence distante.
    & tar.exe --extract --gzip --file $archivePath --directory $installPath trufflehog.exe
    if ($LASTEXITCODE -ne 0) { throw 'Extraction TruffleHog échouée.' }
    $binaryPath = Join-Path $installPath 'trufflehog.exe'
    & $binaryPath --version
    if ($LASTEXITCODE -ne 0) { throw 'Vérification du binaire TruffleHog échouée.' }
    Write-Host "TruffleHog $version installé dans .tools/trufflehog (SHA256 vérifié)."
}
finally {
    foreach ($downloadPath in @($archivePath, $checksumsPath)) {
        if (Test-Path -LiteralPath $downloadPath) {
            Remove-Item -LiteralPath $downloadPath -Force
        }
    }
}
