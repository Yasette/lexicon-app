/* Tricky-word drills, carried over from the original Lexicon's "Tricky words"
   section. Three decks:

   rv  Rhetorical verbs — what a word *does* in an argument. Categories with
       the words that belong to them: [word, English meaning, Turkish meaning].
   m2  Second meanings — the everyday sense and the sense the SAT asks for:
       [word, known meaning (en), SAT meaning (en), known meaning (tr), SAT meaning (tr)].
   tk  Looks negative, isn't ("ters köşe") — words whose prefix misleads:
       [word, equals, meaning (en), meaning (tr), note (en), note (tr)].

   English is always shown; the Turkish column shows when Turkish is the
   chosen language. Other languages fall back to the word list's gloss. */
var TRICKY = {
rv: [
{ c: 'Make a claim', tr: 'iddia ileri sürmek', ws: [
  ['Advance', 'to put forward an idea or argument', 'ileri sürmek, ortaya koymak'],
  ['Posit', 'to put forward as a basis for argument; to assume', 'bir fikri/varsayımı öne sürmek'],
  ['Proffer', 'to offer or present for acceptance', 'sunmak, teklif etmek, ileri sürmek'],
  ['Speculate', 'to form a theory without firm evidence', 'kanıta tam dayanmadan tahminde bulunmak'],
  ['Hypothesize', 'to propose an explanation to be tested', 'hipotez kurmak'] ] },
{ c: 'Support a claim', tr: 'desteklemek', ws: [
  ['Bolster', 'to support or strengthen', 'desteklemek, güçlendirmek'],
  ['Buttress', 'to prop up; to back with evidence', 'sağlamlaştırmak; kanıtla desteklemek'],
  ['Substantiate', 'to prove with evidence', 'kanıtla doğrulamak/desteklemek'] ] },
{ c: 'Question a claim', tr: 'sorgulamak / çürütmek', ws: [
  ['Ambivalence', 'mixed feelings; being torn', 'kararsızlık; hem olumlu hem olumsuz hissetme'],
  ['Skepticism', 'doubt; a questioning attitude', 'şüphecilik, kuşkuyla yaklaşma'],
  ['Rebut', 'to argue against; to try to disprove', 'karşı argümanla çürütmeye çalışmak'],
  ['Refute', 'to prove wrong', 'yanlış olduğunu kanıtlayarak çürütmek'] ] },
{ c: 'Think about', tr: 'üzerine düşünmek', ws: [
  ['Grapple with', 'to struggle with a hard problem', 'zor bir konuyla uğraşmak/boğuşmak'],
  ['Mull over', 'to think about carefully', 'iyice düşünüp tartmak'],
  ['Ruminate about', 'to think about deeply and at length', 'uzun uzun düşünmek, evirip çevirmek'] ] },
{ c: 'Coming together', tr: 'birleşme', ws: [
  ['Converge', 'to come together at one point', 'aynı noktada birleşmek'],
  ['Integrate', 'to combine into a whole', 'birleştirmek, bütünün parçası hâline getirmek'],
  ['Intersect', 'to cross; to share a common point', 'kesişmek; ortak noktada buluşmak'] ] },
{ c: 'Moving apart', tr: 'ayrılma', ws: [
  ['Diverge', 'to separate and go different ways', 'ayrılmak, farklı yönlere gitmek'] ] },
{ c: 'Draw a conclusion', tr: 'sonuç çıkarmak', ws: [
  ['Infer', 'to conclude from evidence and reasoning', 'ipuçlarından çıkarım yapmak'],
  ['Surmise', 'to suppose from little evidence', 'az bilgiyle mantıklı tahminde bulunmak'] ] },
{ c: 'Provide sources', tr: 'kaynak göstermek', ws: [
  ['Attribute', 'to credit an idea to a source', 'bir fikri bir kaynağa atfetmek'],
  ['Cite', 'to quote as evidence or as a source', 'kaynak göstermek, alıntı yapmak'] ] },
{ c: 'Large amount', tr: 'çokluk', ws: [
  ['Multitude', 'a very large number of people or things', 'çok büyük sayıda insan/şey'],
  ['Plethora', 'an excess; more than enough', 'bolluk, gereğinden fazla miktar'],
  ['Profusion', 'a great abundance', 'çok fazla miktar, yoğun bolluk'] ] },
{ c: 'Small amount', tr: 'azlık', ws: [
  ['Dearth', 'a scarcity or lack', 'kıtlık, eksiklik, azlık'],
  ['Paucity', 'a too-small amount', 'yetersiz derecede az miktar'] ] },
{ c: 'Different, diverse', tr: 'farklı, çeşitli', ws: [
  ['Disparate', 'fundamentally different in kind', 'birbirinden apayrı türden'],
  ['Heterogeneous', 'made up of unlike parts', 'farklı türlerden oluşan, karışık'],
  ['Eclectic', 'drawn from many sources or styles', 'farklı kaynaklardan/stillerden seçilmiş'] ] },
{ c: 'Noticeable, striking', tr: 'göze çarpan', ws: [
  ['Conspicuous', 'easily seen; standing out', 'göze çarpan, kolay fark edilen'],
  ['Distinctive', 'characteristic; setting something apart', 'ayırt edici, kendine özgü'],
  ['Salient', 'the most noticeable or important', 'en belirgin, en dikkat çekici/önemli'] ] },
{ c: 'Harmless', tr: 'zararsız', ws: [
  ['Benign', 'harmless; gentle (of a tumour: not cancerous)', 'zararsız; tıpta iyi huylu'],
  ['Innocuous', 'harmless; inoffensive', 'zararsız, rahatsız etmeyen'] ] },
{ c: 'Inborn', tr: 'doğuştan', ws: [
  ['Inherent', 'existing as a natural, inseparable part', 'doğasında bulunan, ayrılmaz özelliği olan'],
  ['Innate', 'present from birth', 'doğuştan gelen'],
  ['Intrinsic', 'belonging to a thing’s own nature', 'özüne ait, içsel, doğal olarak var olan'] ] }
],
m2: [
['Austerity', 'sternness, or a plain and simple way of living', 'severe cuts in government spending', 'sertlik; sade yaşam', 'ekonomik kemer sıkma politikası'],
['Badger', 'the animal', 'to pester someone persistently', 'porsuk', 'sürekli rahatsız etmek, darlamak'],
['Bent', 'curved or crooked', 'a natural inclination (a bent for math)', 'eğilmiş, bükülmüş', 'eğilim, yatkınlık (a bent for math)'],
['Coin', 'a metal piece of money', 'to invent a new word or phrase (coin a term)', 'madeni para', 'yeni bir kelime/ifade ortaya atmak (coin a term)'],
['Conviction', 'a guilty verdict', 'a firmly held belief', 'mahkûmiyet', 'güçlü inanç, kesin kararlılık'],
['Couch', 'a sofa', 'to express in a particular way; to veil (couched in)', 'kanepe', 'örtülü biçimde ifade etmek; gizlemek (couched in)'],
['Doctor', 'a physician', 'to tamper with; to falsify', 'doktor', 'kurcalamak, sahtece değiştirmek'],
['Economy', 'a country’s system of money and trade', 'thrift; using little (economy of words)', 'ekonomi', 'tutumluluk; az kaynakla iş görme (economy of words)'],
['Embroider', 'to decorate with needlework', 'to embellish a story; to exaggerate', 'nakış işlemek', 'abartarak süslemek, ballandırmak'],
['Exploit', 'a bold or daring feat (noun)', 'to make full use of; to take advantage of (verb)', 'kahramanlık, büyük başarı (isim)', 'yararlanmak, sonuna kadar kullanmak (fiil)'],
['Harbor', 'a sheltered port', 'to hold in the mind; to give shelter to (harbor doubts)', 'liman', 'içinde taşımak, barındırmak (harbor doubts)'],
['Hobble', 'to limp', 'to hold back; to hamper', 'topallamak', 'engellemek, köstek olmak'],
['Relay', 'a race run in stages; a handoff', 'to pass along (a message)', 'bayrak yarışı; aktarma', 'iletmek, aktarmak (mesajı)'],
['Ruffled', 'frilled, or rippled', 'flustered; irritated', 'fırfırlı, dalgalı', 'huzursuz, sinirlenmiş']
],
tk: [
['Ineffable', '= sublime', 'too great or beautiful to put into words', 'kelimelerle anlatılamayacak kadar güzel/yüce', 'Not negative', 'negatif DEĞİL'],
['Infallible', '', 'never wrong; incapable of failing', 'asla yanılmaz, şaşmaz', 'Seeing “fail” inside it does not make it negative', '“fail” görüp olumsuz sanma'],
['Ingenious', '', 'very clever; inventive', 'çok zekice, dahiyane', 'Not ingenuous, which means naive or candid', 'ingenuous (saf, içten) ile karıştırma!'],
['Inimitable', '', 'impossible to imitate; one of a kind', 'taklit edilemez, eşsiz', 'Unique', 'unique'],
['Intrinsic', '= innate', 'belonging to a thing’s own nature', 'özünde var olan, içsel', '', ''],
['Invaluable', '', 'priceless; extremely valuable', 'paha biçilemez, çok değerli', 'in- does not mean “without value” here', 'in- burada “değersiz” yapmaz!'],
['Unassuming', '= modest', 'modest; not drawing attention to oneself', 'alçakgönüllü, iddiasız', 'Assumes no importance: no ego', 'assume’lamıyor = egosuz'],
['Unqualified', '', 'complete; absolute (an unqualified success)', 'koşulsuz, mutlak', 'An unqualified success is a total success', 'unqualified success = tam başarı']
]
};
