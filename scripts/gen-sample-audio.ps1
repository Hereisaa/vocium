# scripts/gen-sample-audio.ps1
#
# Generates known-phrase speech WAVs for the non-mic Groq probe, using the
# Windows built-in TTS engine (System.Speech) — no extra dependencies and no
# microphone. The phrases are fixed so the probe transcript can be checked
# against an expected string.
#
# Usage (PowerShell):
#   pwsh -File scripts/gen-sample-audio.ps1
#   npm run probe:groq tests/fixtures/sample-zh.wav
#   npm run probe:groq tests/fixtures/sample-en.wav

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$root    = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $root 'tests/fixtures'
New-Item -ItemType Directory -Force -Path $fixture | Out-Null

# (filename, voiceNameSubstring, phrase)
$samples = @(
  @{ File = 'sample-zh.wav'; Voice = 'Hanhan'; Text = '今天天氣很好，我正在測試 Vocium 的語音輸入功能。' },
  @{ File = 'sample-en.wav'; Voice = 'Zira';   Text = 'The quick brown fox jumps over the lazy dog.' }
)

foreach ($s in $samples) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $voice = $synth.GetInstalledVoices().VoiceInfo |
      Where-Object { $_.Name -like "*$($s.Voice)*" } | Select-Object -First 1
    if ($null -eq $voice) {
      Write-Warning "Voice matching '$($s.Voice)' not installed; skipping $($s.File)"
      continue
    }
    $synth.SelectVoice($voice.Name)
    $out = Join-Path $fixture $s.File
    $synth.SetOutputToWaveFile($out)
    $synth.Speak($s.Text)
    $synth.SetOutputToNull()
    $bytes = (Get-Item $out).Length
    Write-Host "[ok] $out  ($bytes bytes)  expected: $($s.Text)"
  } finally {
    $synth.Dispose()
  }
}
