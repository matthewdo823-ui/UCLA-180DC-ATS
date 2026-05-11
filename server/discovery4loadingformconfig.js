const { google } = require('googleapis');

async function getFormStructure() {
    try {
        // Ensure the library loaded correctly
        if (!google || !google.auth) {
            throw new Error("Google auth library failed to load. Check your 'require' statement.");
        }

        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/forms.body.readonly'],
        });

        const forms = google.forms({ version: 'v1', auth });

        const formId = '1Sm5QSToSxaN6CnFM8KoanGsygc3mUtqG5OniLUWmKxs'; 
        const res = await forms.forms.get({ formId });

        console.log('--- SUCCESS! Copy these IDs into your fieldMap ---');
        res.data.items.forEach(item => {
            if (item.questionItem) {
                console.log(`"${item.questionItem.question.questionId}": "${item.title}",`);
            }
        });
    } catch (error) {
        console.error('Error details:', error.message);
    }
}

getFormStructure();