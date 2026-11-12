// Pedipalpus GameData/SourceBookData/Conditions.json.
export const CONDITION_CATALOG = [
  {
    "Name": "Begehren",
    "Type": "Simple",
    "Description": "Der Charakter hat ein starkes, inneres Verlangen nach einer Handlung oder Sache. Seine Gedanken drehen sich darum und nichts anderes. Er muss sich regelrecht zwingen, an etwas anderes zu denken und selbst dann ist er abgelenkt.\n\nAlle Proben des Charakters, die nicht dazu dienen, sein Begehren zu stillen, sind um -4 erschwert. Gilt nicht in Kampfsituationen, außer der Gegenüber löst das Begehren mit aus.\n\nEin Charakter, der sich mehreren Begehren gegenübersieht, muss dem neusten Begehren nachgehen. Es überschattet das vorangegangene Begehren vollständig.\n\nBegehren bleibt für 1 Stunde bestehen, nachdem der Auslöser nicht mehr gegeben ist. Alternativ dazu kann das Begehren befriedigt werden."
  },
  {
    "Name": "Blutrausch",
    "Type": "Simple",
    "Description": "Der Charakter sieht nur noch rot. Freund, Feind, schuldig, unschuldig? Was spielt das für eine Rolle? Er ist in einem Zustand, der an Besessenheit grenzt und wird mit allen Mitteln versuchen, möglichst viel Tod in die Welt zu bringen.\n\nDer Charakter kann keine defensiven oder taktischen Handlungen mehr durchführen.\n\nEr ignoriert alle Auswirkungen des Zustandes Schmerz.\n\nManöver mit dem Fokus Geschick sind nicht mehr möglich.\n\nEr muss immer den ihm nächsten stehenden Akteur angreifen, mit voller Intention, diesen zu töten.\n\nEin Blutrausch endet, wenn der Charakter handlungsunfähig ist. Dabei ist egal, ob er gefesselt, schwer verwundet oder versteinert ist. Ansonsten hält ein Blutrausch für ungefähr 15 Minuten an."
  },
  {
    "Name": "Krank",
    "Type": "Simple",
    "Description": "Siechen und Seuchen bringen viele Seelen zu früh ins Grab und oft gibt es wenig, dass man gegen eine Krankheit unternehmen kann. Geschulte Heiler sind selten, die benötigten Kräuter und Elixiere nicht immer zu Hand.\n\nDer Charakter hat keine natürliche Regeneration. Während er schlafen kann, um dem Zustand Überanstrengung abzubauen, regeneriert er weder LE noch AE, allerdings ist KE ausgenommen.\n\nKrankheiten haben einen Endzeitpunkt. Der Zustand entfällt, wenn der Patient nicht mehr akut krank ist, also die eigentliche Besserungsphase beginnt."
  },
  {
    "Name": "Reue",
    "Type": "Simple",
    "Description": "Auch wenn man immer hofft, dass es nie dazu kommt, kann die Welt einen dazu zwingen, mit den eigenen Überzeugungen und Prinzipien zu brechen. Das dabei entstehende Gefühl von Versagen, Schande und Scham, ist Reue.\n\nDie Attribute Mut und Charisma des Charakters sind um je 2 Punkte reduziert.\n\nDie Abzüge gelten nicht für Handlungen, die der Charakter durchführt, um seine Reue zu Sühnen.\n\nDer Charakter leidet so lange an seiner Schuld, bis er eine passende Sühne abgelegt hat. Alternativ dazu kann Reue überwunden werden, wenn sich die hinterlegenden Prinzipien des Charakters verändern und in seiner neuen Weltsicht es keinen Grund mehr für Reue gibt."
  },
  {
    "Name": "Angst",
    "Type": "Complex",
    "Description": "Eine Angst hindert einen Charakter daran, effektiv gegen den Auslöser seines Terrors vorzugehen.\n\nAlle Proben, um sich dem Auslöser der Angst zu stellen, sind um [2/4/8] erschwert.\n\nProben, die dazu dienen, dem Auslöser auszuweichen oder vor diesem wegzurennen, sind nicht erschwert.\n\nDie Angst sinkt mit einer Stufe je 5 Minuten nachdem der Auslöser der Angst nicht mehr gegeben ist."
  },
  {
    "Name": "Benommen",
    "Type": "Complex",
    "Description": "Der Zustand entsteht, wenn ein Charakter aus diesem oder jenem Grund nicht klar denken kann. Die üblichste Ursache ist ein starker Treffer gegen den Kopf oder der Genuss von Rauschmitteln. So oder so, ein benommener Charakter agiert nicht im Vollbesitz seiner geistigen und körperlichen Fähigkeiten.\n\nDie Attribute Klugheit, Charisma, Fingerfertigkeit und Gewandtheit sind je um [1/2/4] Punkte reduziert.\n\nDie Geschwindigkeit (GS) sinkt um [1/2/4]\n\nEin Akteur mit der dritten Stufe des Zustandes ist außerdem zu keiner offensiven Kampfhandlung mehr im Stande. Alle anderen Kampfwürfe sind um [2/4/8] erschwert."
  },
  {
    "Name": "Lähmung",
    "Type": "Complex",
    "Description": "Als Lähmung wird jeder Effekt bezeichnet, welcher die Beweglichkeit des Charakters senkt. Ursachen können von Gift und Magie bis hin zu furchtbarer Kälte sein. Die Attribute Fingerfertigkeit und Gewandtheit sind um [2/4/8] Punkte reduziert.\n\nAlle Kampfwürfe sind um [2/4/8] Punkte erschwert.\n\nAlle Proben, welche Fingerfertigkeit oder Gewandtheit beinhalten, sind um [2/4/8] Punkte erschwert.\n\nDie Geschwindigkeit fällt um [4/8/12] Punkte. Fällt die GS auf 0, ist der Charakter wie versteinert und folglich handlungsunfähig.\n\nJe nach Auslöser kann der Zustand unterschiedlich lange halten. Übernatürliche Ursachen und Gifte definieren immer einen klaren Endzeitpunkt, während andere Ursachen, wie etwa große Kälte, situationsbedingt ein Ende finden."
  },
  {
    "Name": "Schmerz",
    "Type": "Complex",
    "Description": "Stürze aus großer Höhe, Treffer im Kampf, ungünstige Verdrehungen und Bewegungen. Körperlicher Schmerz gehört zum Leben eines Abenteurers dazu.\n\nAlle Proben sind um [2/4/8] Punkte erschwert.\n\nDie Geschwindigkeit (GS) sinkt um [1/2/4] Punkte.\n\nIn einem Kampf führt die dritte Stufe des Zustandes zu Handlungsunfähigkeit.\n\nDer Zustand kann durch verlorene Lebensenergie entstehen, was immer passiert, wenn mehr LE verloren wurde, als die Wundschwelle beträgt. Aber auch andere Auslöser sind denkbar mit eigenen Wirkungsdauern."
  },
  {
    "Name": "Überanstrengung",
    "Type": "Complex",
    "Description": "Lange Märsche durch unwegsames Land, das Tragen von Ausrüstung, oder das Aufstemmen von alten Toren: Abenteurer überschreiten gerne einmal die Grenze des Gesunden. Wer sich zu sehr verausgabt, findet sich mit schwachen Gliedern, zittrigen Armen und Beinen und langsamen Reflexen wieder.\n\nDas Reaktionsvermögen des Charakters ist um [2/4/8] reduziert.\n\nAlle körperlich anstrengenden Proben sind um [2/4/8] erschwert.\n\nAlle geistig fordernden Proben sind um [0/2/4] erschwert.\n\nDie Geschwindigkeit des Charakters sinkt um [2/4/8] Punkte, beträgt aber immer mindestens 1.\n\nDer Zustand entfällt vollständig mit einer natürlichen Regeneration. Längere Rasten können (je Stunde) eine Stufe des Zustandes abbauen."
  },
  {
    "Name": "Wut",
    "Type": "Complex",
    "Description": "Gekränkte Ehre, verletzter Stolz, Zorn, über den Verlust eines Kameraden. Gründe für Wut gibt es viele, aber nur in wenigen Fällen, reicht es an die verzerrende und alles überlagernde Wut heran, die hier gemeint ist. Hier wird von einem Gefühl gesprochen, dass sich in den Vordergrund zwingt und sich nicht mehr zurückhalten lässt.\n\nDie Attribute Klugheit und Charisma sinken je um [2/4/8] Punkte.\n\nAlle Kampfwürfe, die dazu dienen, Schaden von sich selbst oder anderen fernzuhalten, sind um [2/4/8] Punkte erschwert.\n\nDer Zustand endet, wenn der Charakter nicht mehr handlungsfähig ist, oder dem Auslöser seiner Wut substantiellen Schaden beigefügt hat. Außerdem können Außenstehende versuchen, beruhigend auf den Charakter einzuwirken. Eine Probe auf Menschenkenntnis: Seelsorge ist um die dreifache Stufe des Zustandes erschwert, bewirkt bei Gelingen aber, dass der Charakter eine Stufe des Zustandes abbaut."
  }
];
