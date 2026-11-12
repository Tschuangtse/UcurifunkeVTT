# Ucurifunke für Foundry VTT V14

Erste Testversion für Charaktere aus Pedipalpus, Proben vom Charakterbogen und Tickkampf.

## Installation

In Foundry unter **Spielsysteme → System installieren** die Manifest-URL einfügen.

```text
https://github.com/Tschuangtse/UcurifunkeVTT/releases/latest/download/system.json
```

Für eine manuelle Installation den Inhalt des Release-ZIPs nach `Data/systems/ucurifunke` im Foundry-Benutzerdatenordner entpacken. Die Datei `system.json` muss direkt in diesem Ordner liegen. Foundry danach neu starten. Für eine Testwelt mit Ucurifunke sind die separaten Kampfmodule und Ucurifunke Checks nicht erforderlich. TickBasedCombat und Quick Combat Actions in dieser Welt deaktiviert lassen, damit die Bedienelemente nicht doppelt geladen werden.

## Erster Test

1. Eine Welt mit dem Spielsystem Ucurifunke anlegen. Im Charakterverzeichnis **Pedipalpus importieren** wählen und eine gespeicherte Charakterdatei im JSON-Format öffnen. Jeder Import erzeugt einen neuen Actor.
2. Am Bogen Attribute, Fertigkeiten, Spezialisierungen und Ausrüstung prüfen. Eine Probe würfeln und Ergebnis sowie Qualität im Chat ansehen. Beim Würfeln über den Bogen allein werden keine Ticks gebucht.
3. Zwei Tokens auf einer Szene platzieren, in einen Kampf aufnehmen und die Tickleiste öffnen. Vor dem Start Initiative würfeln und die aus dem Bogen übernommenen Werte für BE und RE prüfen oder überschreiben.
4. Im laufenden Kampf einen Token auswählen. Über **Offensiv → Nahkampfangriff** eine getragene Waffe wählen, den Waffentickwert prüfen und die Probe bestätigen. Die Ticks fallen unabhängig vom Würfelergebnis an. Wird der Modifikatordialog abgebrochen, werden keine Ticks verbucht.
5. Den Ablauf mit einem Spieler wiederholen, der Besitzer des Actors ist. Ein Spieler ohne Besitzrechte darf dessen Aktionen nicht buchen.

## Umfang von 0.1.0

Der Import liest Pedipalpus-Speicherdateien direkt. Er übernimmt gespeicherte Spielwerte und berechnet unterstützte Waffenwerte und Ladezeiten aus den enthaltenen Daten. Automatische Pedipalpus-Zustandsfolgen, vollständige Sonderfallregeln und das Aktualisieren eines bestehenden Actors beim Reimport sind noch nicht enthalten. Situative Abzüge und Zuschläge lassen sich im Würfeldialog angeben.

Die Tickleiste basiert auf TickBasedCombat 0.3.12 von Tschuangtse und Phil Reif. Die Aktionsleiste basiert auf Ucurifunke Quick Combat Actions 0.2.1 von Tschuangtse.

## Entwicklung

Mit Node.js lassen sich die Tests über `npm test` ausführen. `npm run package` legt das Manifest und das installierbare ZIP in `dist/` ab. Für den Paketbau wird ein `tar` mit ZIP-Unterstützung benötigt, wie es Windows mitliefert.
