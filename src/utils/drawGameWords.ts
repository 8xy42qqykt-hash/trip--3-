export const DRAW_GAME_WORDS: ReadonlyArray<readonly [finnish: string, english: string]> = [
  ['Omena', 'Apple'], ['Banaani', 'Banana'], ['Pizza', 'Pizza'], ['Hampurilainen', 'Burger'],
  ['Jäätelö', 'Ice cream'], ['Kakku', 'Cake'], ['Voileipä', 'Sandwich'], ['Porkkana', 'Carrot'],
  ['Vesimeloni', 'Watermelon'], ['Keksi', 'Cookie'], ['Koira', 'Dog'], ['Kissa', 'Cat'],
  ['Kani', 'Rabbit'], ['Hevonen', 'Horse'], ['Lehmä', 'Cow'], ['Sika', 'Pig'],
  ['Lammas', 'Sheep'], ['Kana', 'Chicken'], ['Ankka', 'Duck'], ['Sammakko', 'Frog'],
  ['Kilpikonna', 'Turtle'], ['Käärme', 'Snake'], ['Lintu', 'Bird'], ['Perhonen', 'Butterfly'],
  ['Mehiläinen', 'Bee'], ['Hämähäkki', 'Spider'], ['Norsu', 'Elephant'], ['Kirahvi', 'Giraffe'],
  ['Apina', 'Monkey'], ['Leijona', 'Lion'], ['Karhu', 'Bear'], ['Pingviini', 'Penguin'],
  ['Hai', 'Shark'], ['Valas', 'Whale'], ['Mustekala', 'Octopus'], ['Rapu', 'Crab'],
  ['Delfiini', 'Dolphin'], ['Aurinko', 'Sun'], ['Kuu', 'Moon'], ['Tähti', 'Star'],
  ['Pilvi', 'Cloud'], ['Sateenkaari', 'Rainbow'], ['Lumiukko', 'Snowman'], ['Puu', 'Tree'],
  ['Kukka', 'Flower'], ['Sieni', 'Mushroom'], ['Kaktus', 'Cactus'], ['Vuori', 'Mountain'],
  ['Ranta', 'Beach'], ['Tulivuori', 'Volcano'], ['Talo', 'House'], ['Linna', 'Castle'],
  ['Koulu', 'School'], ['Sairaala', 'Hospital'], ['Kauppa', 'Shop'], ['Bussi', 'Bus'],
  ['Auto', 'Car'], ['Polkupyörä', 'Bicycle'], ['Juna', 'Train'], ['Lentokone', 'Airplane'],
  ['Vene', 'Boat'], ['Raketti', 'Rocket'], ['Helikopteri', 'Helicopter'], ['Rullalauta', 'Skateboard'],
  ['Potkulauta', 'Scooter'], ['Pallo', 'Ball'], ['Leija', 'Kite'], ['Ilmapallo', 'Balloon'],
  ['Nalle', 'Teddy bear'], ['Nukke', 'Doll'], ['Robotti', 'Robot'], ['Hirviö', 'Monster'],
  ['Kummitus', 'Ghost'], ['Merirosvo', 'Pirate'], ['Supersankari', 'Superhero'], ['Kruunu', 'Crown'],
  ['Hattu', 'Hat'], ['Kenkä', 'Shoe'], ['Sukka', 'Sock'], ['Silmälasit', 'Glasses'],
  ['Sateenvarjo', 'Umbrella'], ['Reppu', 'Backpack'], ['Matkalaukku', 'Suitcase'], ['Kirja', 'Book'],
  ['Lyijykynä', 'Pencil'], ['Puhelin', 'Phone'], ['Kamera', 'Camera'], ['Tietokone', 'Computer'],
  ['Kello', 'Clock'], ['Avain', 'Key'], ['Lamppu', 'Lamp'], ['Tuoli', 'Chair'],
  ['Pöytä', 'Table'], ['Sänky', 'Bed'], ['Hammasharja', 'Toothbrush'], ['Kitara', 'Guitar'],
  ['Rumpu', 'Drum'], ['Jalkapallo', 'Football'], ['Lumihiutale', 'Snowflake'], ['Rannekello', 'Watch'],
];

export const getDrawGameWordLabel = (englishWord: string, language: 'en' | 'fi') => {
  const pair = DRAW_GAME_WORDS.find(([, english]) => english.toLocaleLowerCase() === englishWord.toLocaleLowerCase());
  if (!pair) return englishWord;
  return language === 'fi' ? `${pair[0]} / ${pair[1]}` : `${pair[1]} / ${pair[0]}`;
};
