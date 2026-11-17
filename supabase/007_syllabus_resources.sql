-- Week-by-week syllabus; classes get their topic from it automatically (tutors/admins can still overwrite)
create table public.syllabus (
  level public.cefr_level not null,
  week_no int not null check (week_no between 1 and 52),
  topic text not null,
  primary key (level, week_no)
);
alter table public.syllabus enable row level security;
create policy "signed-in read syllabus" on public.syllabus for select to authenticated using (public.is_active());
create policy "admin syllabus" on public.syllabus for all using (public.is_admin()) with check (public.is_admin());

insert into public.syllabus (level, week_no, topic) values
 ('A1',1,'Bonjour ! Premier contact — Greetings, alphabet & identity'),
 ('A1',2,'Le temps & les chiffres — Numbers, time, days & dates'),
 ('A1',3,'Mon monde — Articles, professions & family'),
 ('A1',4,'Comment tu es ? — Adjectives, clothes & colours'),
 ('A1',5,'Révision & au restaurant — Review of weeks 1–4, food & ordering'),
 ('A1',6,'Chez moi — Home, rooms & furniture'),
 ('A1',7,'Ma journée — -ER verbs & daily routine'),
 ('A1',8,'Ma routine en détail — Reflexive verbs & frequency adverbs'),
 ('A1',9,'Où est… ? — Prepositions of place & giving directions'),
 ('A1',10,'On y va ! — Verb aller, transport & invitations'),
 ('A1',11,'Hier… — Passé composé with avoir'),
 ('A1',12,'Révision générale & évaluation — Review of all A1 content + final assessment'),
 ('A2',1,'Se retrouver — Revisiting introductions & personal information'),
 ('A2',2,'Au quotidien — Irregular verbs: prendre, venir, pouvoir, vouloir'),
 ('A2',3,'Mon passé — Passé composé with être & agreement'),
 ('A2',4,'C''était comment ? — The imparfait: description & habits in the past'),
 ('A2',5,'Révision & à table — Review of weeks 1–4, food, quantities & shopping'),
 ('A2',6,'Dans la ville — Prepositions, locations & asking for information'),
 ('A2',7,'Ma santé — The body, health, symptoms & advice'),
 ('A2',8,'Au travail — Jobs, workplaces & talking about abilities'),
 ('A2',9,'En voyage — Travel, accommodation & making plans'),
 ('A2',10,'Les médias & moi — Opinions, media & reported speech'),
 ('A2',11,'La vie sociale — Invitations, events & the conditional'),
 ('A2',12,'Révision générale & évaluation — Review of all A2 content + final assessment');

create function public.class_topic_from_syllabus() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.topic is null and new.week_no is not null then
    select s.topic into new.topic from public.syllabus s where s.level = new.level and s.week_no = new.week_no;
  end if;
  return new;
end $$;
create trigger class_topic before insert or update of level, week_no on public.classes
  for each row execute function public.class_topic_from_syllabus();

-- Fill topics for classes that already exist
update public.classes c set topic = s.topic from public.syllabus s
 where c.topic is null and s.level = c.level and s.week_no = c.week_no;

-- More free resources (edit or remove from Library)
insert into public.resources (title, level, skill, source, url, created_by) values
 ('Learn French with TV5MONDE: exercises by level','A1','Listening','TV5Monde','https://apprendre.tv5monde.com/fr',null),
 ('Le français c''est facile avec Adrien (beginners podcast)','A1','Listening','Ausha podcast','https://podcast.ausha.co/le-francais-c-est-facile-avec-adrien-pour-debutants',null),
 ('Mini-dialogue: se présenter (PDF)','A1','Speaking','Podcast Français Facile','https://www.podcastfrancaisfacile.com/wp-content/uploads/2021/12/mini-dialgue-se-presenter.pdf',null),
 ('Dialogue: le nouveau voisin (PDF)','A1','Speaking','Podcast Français Facile','https://www.podcastfrancaisfacile.com/wp-content/uploads/2018/08/nouveau-voisin-dialogue-fle.pdf',null),
 ('A1 vocabulary lessons by topic','A1','Reading','Lawless French','https://www.lawlessfrench.com/faq/lessons-by-level/a1-vocabulary/',null),
 ('Tex''s French Grammar: être, avoir, articles, -ER verbs','A1','Grammar','UT Austin','https://laits.utexas.edu/tex/',null),
 ('DELF A1 official sample papers','A1','Writing','France Éducation international','https://www.france-education-international.fr/diplome/delf-tout-public/niveau-a1/exemples-sujets',null),
 ('A2 grammar lessons','A2','Grammar','Lawless French','https://www.lawlessfrench.com/faq/lessons-by-level/a2-grammar/',null),
 ('Imparfait & passé composé quizzes','A2','Grammar','Kwiziq French','https://french.kwiziq.com',null),
 ('Dialogue: travail étudiant (PDF)','A2','Speaking','Podcast Français Facile','https://www.podcastfrancaisfacile.com/wp-content/uploads/2018/11/travail-etudiant-dialogue-fle.pdf',null),
 ('Exercise directory: grammar, vocabulary, listening','A2','Grammar','Le Point du FLE','https://www.lepointdufle.net/p/cours_fle.htm',null),
 ('FLE exercises and guides','A2','Reading','Digischool','https://www.digischool.fr/fle',null),
 ('DELF A2 official sample papers','A2','Writing','France Éducation international','https://www.france-education-international.fr/diplome/delf-tout-public/niveau-a2/exemples-sujets',null),
 ('InnerFrench podcast (intermediate)','B1','Listening','InnerFrench','https://podcast.innerfrench.com/',null),
 ('Journal en français facile (daily news, 10 min)','B1','Listening','RFI','https://tunein.com/podcasts/p3563513',null),
 ('1jour1actu: news explained simply','B1','Reading','1jour1actu','https://www.1jour1actu.com',null),
 ('TV5MONDE learning app (all levels)','B1','Listening','TV5Monde','https://apps.apple.com/app/id1482250598',null),
 ('DELF B1 official sample papers','B1','Writing','France Éducation international','https://www.france-education-international.fr/diplome/delf-tout-public/niveau-b1/exemples-sujets',null),
 ('DELF B1–B2 oral: structure, timing and method','B1','Speaking','Digischool','https://www.digischool.fr/articles/fle/production-orale-delf-b1-b2/',null),
 ('DELF B2 official sample papers','B2','Writing','France Éducation international','https://www.france-education-international.fr/diplome/delf-tout-public/niveau-b2/exemples-sujets',null),
 ('DALF C1 official sample papers','C1','Writing','France Éducation international','https://france-education-international.fr/diplome/dalf/exemples-sujets',null),
 ('DALF C1: official preparation tips','C1','Speaking','France Éducation international','https://www.france-education-international.fr/article/dalf-c1-conseils',null),
 ('TCF practice: listening, reading, writing, speaking','TCF','Listening','TV5Monde','https://apprendre.tv5monde.com/fr/tcf',null),
 ('TCF listening: examples and tips','TCF','Listening','Digischool','https://www.digischool.fr/articles/fle/comprehension-orale-tcf/',null),
 ('TCF Canada scores and NCLC targets','TCF','Reading','Digischool','https://www.digischool.fr/articles/fle/tcf-canada-entree-express/',null),
 ('Prepare for the TEF (official)','TCF','Reading','CCI Paris Île-de-France','https://lefrancaisdesaffaires.fr/en/tests-diplomas/prepare-for-the-tef',null),
 ('TEF oral expression: expert tips','TCF','Speaking','CCI Paris Île-de-France','https://lefrancaisdesaffaires.fr/en/prepare-yourself-for-the-oral-expression-tef',null),
 ('TEF written comprehension: expert tips','TCF','Reading','CCI Paris Île-de-France','https://lefrancaisdesaffaires.fr/en/prepare-yourself-for-the-written-comprehension-tef',null),
 ('TEF vocabulary and syntax: expert tips','TCF','Grammar','CCI Paris Île-de-France','https://lefrancaisdesaffaires.fr/en/prepare-yourself-for-the-vocabulary-and-syntax-tef',null),
 ('TEF formats: Canada, IRN, naturalisation','TCF','Reading','Digischool','https://www.digischool.fr/articles/fle/tef-format-epreuves-deroule/',null);
