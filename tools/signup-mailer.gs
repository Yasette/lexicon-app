// Lexicon — new-account notifier (Google Apps Script).
//
// 1. Sign in to script.google.com AS THE MAILBOX THAT SHOULD GET THE NOTES
//    (the Lexicon Gmail account), New project, paste this file, name it
//    "Lexicon signups".
// 2. Change SECRET below to a long random string (a password generator is
//    fine). Keep it; the SQL needs the same value.
// 3. Deploy → New deployment → type: Web app → Execute as: Me → Who has
//    access: Anyone → Deploy. Authorise when asked (it needs "send email as
//    you"). Copy the Web app URL.
// 4. Paste supabase/notify-signups.sql into Supabase's SQL editor, replace the
//    two PASTE placeholders there (in the editor, not in the file: the file is
//    in git) with the URL and the SECRET, and run it.
//
// Every new account then produces one email to this mailbox. Google allows a
// consumer account 100 such emails a day, which is plenty.

var SECRET = 'PASTE-A-LONG-RANDOM-SECRET-HERE';   // change it in the script editor only; never commit the real one

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) {}
  if (!data.secret || data.secret !== SECRET) {
    return ContentService.createTextOutput('no');
  }
  var to = Session.getEffectiveUser().getEmail();       // the account this script runs as
  var email = String(data.email || '?'), when = String(data.created || ''), how = String(data.provider || 'email');
  MailApp.sendEmail({
    to: to,
    subject: 'New Lexicon account: ' + email,
    body: 'A new Lexicon account was created.\n\n' +
          'Email:   ' + email + '\n' +
          'When:    ' + when + ' (Istanbul time)\n' +
          'Sign-in: ' + how + '\n'
  });
  return ContentService.createTextOutput('ok');
}

// Optional: run this once from the editor to check the mail permission.
function testMail() {
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: 'Lexicon signups: test', body: 'It works.' });
}
