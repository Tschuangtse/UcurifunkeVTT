# Ucurifunke für Foundry VTT V14

Erste Testversion für Charaktere aus Pedipalpus, Proben vom Charakterbogen und Tickkampf.

## Installation

In Foundry unter **Spielsysteme → System installieren** die Manifest-URL einfügen.

```text
https://github.com/Tschuangtse/UcurifunkeVTT/releases/latest/download/system.json
```

Für eine manuelle Installation den Inhalt des Release-ZIPs nach `Data/systems/ucurifunke` im Foundry-Benutzerdatenordner entpacken. Die Datei `system.json` muss direkt in diesem Ordner liegen. Foundry danach neu starten. Für eine Testwelt mit Ucurifunke sind die separaten Kampfmodule und Ucurifunke Checks nicht erforderlich. TickBasedCombat und Quick Combat Actions in dieser Welt deaktiviert lassen, damit die Bedienelemente nicht doppelt geladen werden.

## Erster Test

1. Eine Welt mit dem Spielsystem Ucurifunke anlegen. Im Charakterverzeichnis **Pedipalpus importieren** wählen und eine gespeicherte Charakterdatei im JSON-Format öffnen. Der Button erzeugt einen neuen Actor. Über **Daten importieren** im Kontextmenü eines vorhandenen Actors kannst du stattdessen dessen Namen, Spielwerte und Inventar durch die Daten aus der Datei ersetzen.
2. Im Bogen zwischen **Grundwerte**, **Kampf**, **Munda**, **Magie** und **Klerikal** wechseln. Jeder Reiter hat eine Suche. In den drei Fertigkeitsreitern mit vorhandenen Proben lässt sich zusätzlich nach Bereich filtern. Über das Auge neben dem Charakternamen lässt sich Wahrnehmung würfeln. Der Dialog schlägt Klugheit, Intuition und Intuition vor.
3. Zwei Tokens auf einer Szene platzieren, in einen Kampf aufnehmen und die Tickleiste öffnen. Das Fragezeichen im Fensterkopf zeigt die Hinweise für deine Rolle. Vor dem Start Initiative würfeln und die aus dem Bogen übernommenen Werte für BE und RE prüfen oder überschreiben. Beim Schließen der Zeitleiste verschwinden ihre Token-Markierungen.
4. Im laufenden Kampf einen Token auswählen. Über **Offensiv → Nahkampfangriff** eine getragene Waffe wählen, den Waffentickwert prüfen und die Probe bestätigen. Die Ticks fallen unabhängig vom Würfelergebnis an. Wird der Modifikatordialog abgebrochen, werden keine Ticks verbucht.
5. Den Ablauf mit einem Spieler wiederholen, der Besitzer des Actors ist. Ein Spieler ohne Besitzrechte darf dessen Aktionen nicht buchen.
6. Im Probenfenster **Verdeckte Probe** wählen und aus Spieler- und Spielleitersicht prüfen. Das W20-Symbol unten in der linken Szenenleiste öffnet einen Dialog mit je einem Zahlenfeld für W3, W6 und W20. Die Chatkarte gruppiert die Einzelwürfe nach Würfelart und zeigt die Gesamtsumme.
7. Im Reiter **Kampf** eine Kampftechnik über **AT**, **PA** oder **FK** würfeln. Toleranz, Tickkosten und Boni werden beim Würfeln je Charakter und Technik gespeichert. Mit einem passenden ausgewählten Token im laufenden Kampf können die Tickkosten im Dialog gebucht werden.
8. Einen Pedipalpus-Befehl direkt in den Chat einfügen. `/attributecheck`, `/skillcheck`, `/AT`, `/PA` und `/FK` öffnen den gleichen Proben­dialog wie der Bogen.

## Umfang der Testversion

Der Import liest Pedipalpus-Speicherdateien direkt. Er übernimmt gespeicherte Spielwerte und berechnet unterstützte Waffenwerte und Ladezeiten aus den enthaltenen Daten. Automatische Pedipalpus-Zustandsfolgen und vollständige Sonderfallregeln sind noch nicht enthalten. Situative Abzüge und Zuschläge lassen sich im Würfeldialog angeben.

Ein erneuter Import aus Pedipalpus ergänzt bei älteren Foundry-Charakteren die Einzelwerte für Kampfproben und stellt Ritualproben und Wunder anhand der Quelldatei bereit.

Die Tickleiste basiert auf TickBasedCombat 0.3.12 von Tschuangtse und Phil Reif. Die Aktionsleiste basiert auf Ucurifunke Quick Combat Actions 0.2.1 von Tschuangtse.

## Entwicklung

Mit Node.js lassen sich die Tests über `npm test` ausführen. `npm run package` legt das Manifest und das installierbare ZIP in `dist/` ab. Für den Paketbau wird ein `tar` mit ZIP-Unterstützung benötigt, wie es Windows mitliefert.
