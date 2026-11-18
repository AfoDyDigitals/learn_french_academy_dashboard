-- 2026-11-18 link check: replace pages that return 404 or moved
update public.resources set title = 'Prepare for TEF Canada (official)', url = 'https://www.lefrancaisdesaffaires.fr/en/candidate/test-evaluation-francais/tef-canada/preparation/'
  where url = 'https://lefrancaisdesaffaires.fr/en/tests-diplomas/prepare-for-the-tef';
update public.resources set title = 'Prepare for TEF IRN (official)', url = 'https://www.lefrancaisdesaffaires.fr/en/candidate/test-evaluation-francais/tef-irn/preparation/'
  where url = 'https://lefrancaisdesaffaires.fr/en/prepare-yourself-for-the-oral-expression-tef';
update public.resources set title = 'Prepare for TEF Études (official)', url = 'https://www.lefrancaisdesaffaires.fr/en/candidate/test-evaluation-francais/tef-etudes/preparation/'
  where url = 'https://lefrancaisdesaffaires.fr/en/prepare-yourself-for-the-written-comprehension-tef';
update public.resources set title = 'Get ready for the TEF with AI (official)', url = 'https://www.lefrancaisdesaffaires.fr/en/get-ready-for-the-tef-with-ai/'
  where url = 'https://lefrancaisdesaffaires.fr/en/prepare-yourself-for-the-vocabulary-and-syntax-tef';
update public.resources set url = 'https://francaisfacile.rfi.fr/fr/', source = 'RFI Le français facile' where url = 'https://savoirs.rfi.fr/fr/apprendre-enseigner';
update public.resources set title = 'Le français facile avec RFI: lessons by level' where title = 'Le week-end dernier';
update public.resources set title = 'Journal en français facile (RFI learning site)' where title = 'Journal en français facile' and url = 'https://francaisfacile.rfi.fr/fr/';
update public.resources set title = 'TV5MONDE: beginner exercises (choose A1)' where title = 'Se présenter' and url = 'https://apprendre.tv5monde.com/fr';
