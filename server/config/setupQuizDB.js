// config/setupQuizDB.js
const db = require("./database");

async function setupQuizDB() {
  try {
    console.log("🛠️ Setting up Quiz game database tables...");

    // Drop old quiz_questions table to ensure clean schema update with translations and domain column
    await db.execute("DROP TABLE IF EXISTS quiz_questions");
    console.log("Dropped old quiz_questions table for recreation.");

    // 1. quiz_questions table with English, Hindi, and Marathi translations + domain column
    await db.execute(`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        domain VARCHAR(50) NOT NULL DEFAULT 'General',
        company_id INT DEFAULT NULL,
        question TEXT NOT NULL,
        option_a VARCHAR(255) NOT NULL,
        option_b VARCHAR(255) NOT NULL,
        option_c VARCHAR(255) NOT NULL,
        option_d VARCHAR(255) NOT NULL,
        correct_index INT NOT NULL,
        explanation TEXT NOT NULL,
        
        -- Hindi Columns
        question_hi TEXT DEFAULT NULL,
        option_a_hi VARCHAR(255) DEFAULT NULL,
        option_b_hi VARCHAR(255) DEFAULT NULL,
        option_c_hi VARCHAR(255) DEFAULT NULL,
        option_d_hi VARCHAR(255) DEFAULT NULL,
        explanation_hi TEXT DEFAULT NULL,
        
        -- Marathi Columns
        question_mr TEXT DEFAULT NULL,
        option_a_mr VARCHAR(255) DEFAULT NULL,
        option_b_mr VARCHAR(255) DEFAULT NULL,
        option_c_mr VARCHAR(255) DEFAULT NULL,
        option_d_mr VARCHAR(255) DEFAULT NULL,
        explanation_mr TEXT DEFAULT NULL,
        
        points INT DEFAULT 150,
        active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    // 2. quiz_employee_stats table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS quiz_employee_stats (
        user_id INT PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        points INT DEFAULT 0,
        streak INT DEFAULT 0,
        last_quiz_date DATE DEFAULT NULL
      ) ENGINE=InnoDB;
    `);

    // 3. quiz_submissions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS quiz_submissions (
        submission_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        question_id INT NOT NULL,
        answer_index INT NOT NULL,
        is_correct TINYINT NOT NULL,
        points_awarded INT DEFAULT 0,
        submitted_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Safe Schema Update: Drop single daily submission constraint and replace with composite unique constraint
    try {
      await db.execute("ALTER TABLE quiz_submissions DROP INDEX unique_user_date");
      console.log("Dropped unique_user_date constraint.");
    } catch (e) {
      // Ignore if index doesn't exist
    }

    try {
      await db.execute("ALTER TABLE quiz_submissions ADD UNIQUE KEY unique_user_question_date (user_id, question_id, submitted_date)");
      console.log("Added composite unique_user_question_date constraint.");
    } catch (e) {
      // Ignore if index already exists
    }

    // 4. quiz_rewards table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS quiz_rewards (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        emoji VARCHAR(10) NOT NULL,
        cost INT NOT NULL,
        stock INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Re-seed all 16 domain scenario questions (2 per domain: IT, CA, CS, Legal, Real Estate, Sales, Insurance, Hospital)
    console.log("🌱 Seeding corporate scenario questions...");
    
    const domainQuestions = [
      // IT - Question 1
      [
        'IT',
        'A colleague asks you to share your password to quickly deploy a bug fix. What is the correct response?',
        'Refuse and offer to deploy the fix yourself.',
        'Write the password on a sticky note.',
        'Send it via slack direct message.',
        'Tell them the password verbally.',
        0,
        'IT security policy strictly prohibits sharing credentials. Offering to deploy it yourself maintains compliance. 🔒',
        'एक सहकर्मी आपसे बग फिक्स करने के लिए अपना पासवर्ड साझा करने को कहता है। सही प्रतिक्रिया क्या है?',
        'अस्वीकार करें और खुद फिक्स को लागू करने की पेशकश करें।',
        'पासवर्ड को स्टिकी नोट पर लिख दें।',
        'इसे स्लैक डायरेक्ट मैसेज के जरिए भेजें।',
        'उन्हें मौखिक रूप से पासवर्ड बताएं।',
        'आईटी सुरक्षा नीति क्रेडेंशियल साझा करने की सख्त मनाही करती है। खुद फिक्स लागू करने से सुरक्षा बनी रहती है। 🔒',
        'एका सहकाऱ्याने तुम्हाला बग फिक्स करण्यासाठी तुमचा पासवर्ड शेअर करण्यास सांगितले. योग्य उत्तर काय असेल?',
        'नकार द्या आणि स्वतः फिक्स लागू करण्याची ऑफर द्या.',
        'पासवर्ड एका स्टिकी नोटवर लिहून ठेवा.',
        'तो स्लॅक डायरेक्ट मेसेजद्वारे पाठवा.',
        'त्यांना तोंडी पासवर्ड सांगा.',
        'आयटी सुरक्षा धोरण क्रेडेंशियल शेअर करण्यास सक्त मनाई करते. स्वतः फिक्स लागू केल्याने सुरक्षा टिकून राहते. 🔒'
      ],
      // IT - Question 2
      [
        'IT',
        'You notice a critical security patch is available for a third-party library. When should this be updated?',
        'Immediately, following the company\'s hotfix testing procedures.',
        'At the end of the quarterly cycle.',
        'Only if a client notices an issue.',
        'Ignore it unless it breaks current features.',
        0,
        'Security vulnerability patches should be applied as soon as tested to protect company and user data. 🛡️',
        'आप देखते हैं कि एक थर्ड-पार्टी लाइब्रेरी के लिए एक महत्वपूर्ण सुरक्षा पैच उपलब्ध है। इसे कब अपडेट किया जाना चाहिए?',
        'तुरंत, कंपनी की हॉटफिक्स परीक्षण प्रक्रियाओं के बाद।',
        'तिमाही चक्र के अंत में।',
        'केवल तभी जब कोई क्लाइंट किसी समस्या पर ध्यान दे।',
        'इसे अनदेखा करें जब तक कि यह वर्तमान सुविधाओं को न तोड़ दे।',
        'कंपनी और उपयोगकर्ता डेटा की सुरक्षा के लिए परीक्षण के तुरंत बाद सुरक्षा पैच लागू किया जाना चाहिए। 🛡️',
        'तुम्हाला एका थर्ड-पार्टी लायब्ररीसाठी एक महत्त्वाचा सुरक्षा पॅच उपलब्ध असल्याचे समजले. तो कधी अपडेट करावा?',
        'ताबडतोब, कंपनीच्या हॉटफिक्स चाचणी प्रक्रियेचे पालन करून.',
        'त्रैमासिक चक्राच्या शेवटी.',
        'फक्त क्लायंटला काही अडचण आली तरच.',
        'सध्याचे फीचर्स बिघडत नसल्यास दुर्लक्ष करा.',
        'कंपनी आणि युझर डेटा सुरक्षित ठेवण्यासाठी चाचणी केल्यानंतर ताबडतोब सुरक्षा पॅच लागू करणे आवश्यक आहे. 🛡️'
      ],
      // CA - Question 1
      [
        'CA',
        'When your manager asks for your work report, what is the best thing to do?',
        'Give a clear and honest update of your work.',
        'Hide your mistakes and say everything is done.',
        'Do not reply and switch off your phone.',
        'Ask another person to do your report.',
        0,
        'Honesty builds trust. Telling the truth about your work status helps the team support you. 🤝',
        'जब आपका मैनेजर आपके काम की रिपोर्ट मांगता है, तो सबसे अच्छा काम क्या है?',
        'अपने काम की सही और ईमानदारी से जानकारी दें।',
        'अपनी गलतियों को छुपाएं और कहें कि सब हो गया है।',
        'कोई जवाब न दें और अपना फोन बंद कर लें।',
        'किसी दूसरे व्यक्ति से कहें कि वह आपकी रिपोर्ट बना दे।',
        'ईमानदारी से भरोसा बनता है। अपने काम की सही स्थिति बताने से पूरी टीम आपकी मदद कर सकती है। 🤝',
        'जेव्हा तुमचे मॅनेजर तुमच्या कामाचा रिपोर्ट मागतात, तेव्हा सर्वात योग्य गोष्ट कोणती?',
        'तुमच्या कामाची खरी आणि प्रामाणिक माहिती द्या.',
        'तुमच्या चुका लपवा आणि सर्व काम पूर्ण झाल्याचे सांगा.',
        'काहीही उत्तर देऊ नका आणि font बंद करा.',
        'दुसऱ्या व्यक्तीला तुमचा रिपोर्ट बनवायला सांगा.',
        'प्रामाणिकपणामुळे विश्वास निर्माण होतो. कामाची खरी माहिती दिल्याने संपूर्ण टीम तुम्हाला मदत करू शकते. 🤝'
      ],
      // CA - Question 2
      [
        'CA',
        'You spent money on office work but lost the paper bill receipt. How can you show the accounts officer?',
        'Show a digital mobile bank payment message or statement.',
        'Shout and argue with the accounts officer.',
        'Make a fake hand-written paper bill.',
        'Take money secretly from the office cash box.',
        0,
        'Accounts officers need proof for taxes. A digital bank message is clean and legal. 🧾',
        'आपने ऑफिस के काम पर पैसे खर्च किए लेकिन पेपर बिल रसीद खो दी। आप अकाउंटेंट को कैसे साबित करेंगे?',
        'मोबाइल पर बैंक से पैसे कटने का मैसेज या बैंक स्टेटमेंट दिखाएंगे।',
        'अकाउंटेंट से बहस और लड़ाई करेंगे।',
        'कागज पर हाथ से नकली बिल बना देंगे।',
        'ऑफिस के पैसे वाले गल्ले से चुपचाप पैसे निकाल लेंगे।',
        'टैक्स के लिए सबूत जरूरी है। बैंक का डिजिटल मैसेज दिखाना सुरक्षित और कानूनी तरीका है। 🧾',
        'तुम्ही ऑफिसच्या कामासाठी पैसे खर्च केले पण मूळ कागदी बिल गमावले. तुम्ही अकाउंटेंटला कसे दाखवणार?',
        'मोबाईलवरील बँक पेमेंटचा मेसेज किंवा बँक स्टेटमेंट दाखवणार.',
        'अकाउंटेंटशी वाद घालणार आणि भांडण करणार.',
        'कागदावर हाताने बनवलेले खोटे बिल देणार.',
        'ऑफिसच्या पैशांच्या कप्प्यातून चोरून पैसे काढणार.',
        'कराच्या नियमांसाठी पुरावा आवश्यक असतो. बँकेचा डिजिटल मेसेज किंवा बँक स्टेटमेंट दाखवणे कायदेशीर ठरते. 🧾'
      ],
      // CS - Question 1
      [
        'CS',
        'A director asks to hold a board meeting without sending formal notices to all members. What is the correct advice?',
        'Formal notice must be sent to all directors as per compliance requirements.',
        'Hold the meeting and send notices later.',
        'Skip notices if all directors verbally agree.',
        'Proceed since directors have special powers.',
        0,
        'Under Company Secretary guidelines, all board meetings must have formal, timely notice sent to remain legally valid. 📋',
        'एक निदेशक सभी सदस्यों को औपचारिक नोटिस भेजे बिना बोर्ड बैठक आयोजित करने के लिए कहता है। सही सलाह क्या है?',
        'अनुपालन आवश्यकताओं के अनुसार सभी निदेशकों को औपचारिक नोटिस भेजा जाना चाहिए।',
        'बैठक आयोजित करें और बाद में नोटिस भेजें।',
        'यदि सभी निदेशक मौखिक रूप से सहमत हैं तो नोटिस न भेजें।',
        'आगे बढ़ें क्योंकि निदेशकों के पास विशेष शक्तियां हैं।',
        'कंपनी सचिव दिशानिर्देशों के तहत, कानूनी रूप से वैध रहने के लिए सभी बोर्ड बैठकों के लिए औपचारिक, समय पर नोटिस भेजना आवश्यक है। 📋',
        'एका संचालकाने सर्व सदस्यांना अधिकृत नोटीस न पाठवता बोर्डाची बैठक घेण्यास सांगितले. योग्य सल्ला काय असेल?',
        'नियम व अटींनुसार सर्व संचालकांना अधिकृत नोटीस पाठवणे बंधनकारक आहे.',
        'बैठक घ्या आणि नोटीस नंतर पाठवा.',
        'सर्व संचालक तोंडी सहमत असल्यास नोटीस देणे टाळा.',
        'संचालकांकडे विशेष अधिकार असल्याने पुढे जा.',
        'कंपनी सेक्रेटरी मार्गदर्शक तत्त्वांनुसार, कायदेशीररित्या वैध राहण्यासाठी सर्व बोर्ड बैठकांसाठी अधिकृत आणि वेळेवर नोटीस पाठवणे आवश्यक आहे. 📋'
      ],
      // CS - Question 2
      [
        'CS',
        'You discover that the company\'s annual filings are overdue. What is the priority action?',
        'Report it to the board immediately and prepare filings with late fees.',
        'Wait until the next audit cycle.',
        'Hide the status until the registrar sends a warning.',
        'Falsify the filing date to avoid late fees.',
        0,
        'Delayed filings must be addressed immediately with transparency to minimize penalty exposure and stay compliant. 🏛️',
        'आपको पता चलता है कि कंपनी की वार्षिक फाइलिंग में देरी हो चुकी है। प्राथमिकता वाली कार्रवाई क्या है?',
        'बोर्ड को तुरंत सूचित करें और विलंब शुल्क के साथ फाइलिंग तैयार करें।',
        'अगले ऑडिट चक्र तक प्रतीक्षा करें।',
        'रजिस्ट्रार द्वारा चेतावनी भेजे जाने तक स्थिति छुपाएं।',
        'विलंब शुल्क से बचने के लिए फाइलिंग की तारीख गलत दर्ज करें।',
        'जुर्माने को कम करने और अनुपालन बनाए रखने के लिए देरी से हुई फाइलिंग को पारदर्शिता के साथ तुरंत हल किया जाना चाहिए। 🏛️',
        'कंपनीचे वार्षिक फायलिंग थकीत असल्याचे तुमच्या लक्षात आले. तुमची पहिली कृती काय असेल?',
        'त्वरित बोर्डाला कळवून विलंब शुल्कासह फायलिंग पूर्ण करण्याची तयारी करणे.',
        'पुढच्या ऑडिट सायकलची वाट पाहणे.',
        'रजिस्ट्रारकडून चेतावणी यायच्या आधी ही बाब लपवून ठेवणे.',
        'लेट फी वाचवण्यासाठी फायलिंगची तारीख खोटी टाकणे.',
        'दंड कमी करण्यासाठी आणि नियमांचे पालन करण्यासाठी थकीत फायलिंग त्वरित आणि पारदर्शकपणे पूर्ण करणे आवश्यक आहे. 🏛️'
      ],
      // Legal - Question 1
      [
        'Legal',
        'A potential vendor asks for confidential client details before signing an NDA. What should you do?',
        'Refuse to share details until the NDA is signed by both parties.',
        'Share details to speed up negotiations.',
        'Share only a few details verbally.',
        'Ask them to sign a verbal promise instead.',
        0,
        'Confidential company or client information should never be shared without a fully executed Non-Disclosure Agreement (NDA). 📝',
        'एक संभावित विक्रेता एनडीए पर हस्ताक्षर करने से पहले गोपनीय ग्राहक विवरण मांगता है। आपको क्या करना चाहिए?',
        'दोनों पक्षों द्वारा एनडीए पर हस्ताक्षर होने तक विवरण साझा करने से मना करें।',
        'बातचीत तेज करने के लिए विवरण साझा करें।',
        'मौखिक रूप से केवल कुछ विवरण साझा करें।',
        'इसके बजाय उनसे मौखिक वादा करने को कहें।',
        'पूरी तरह से निष्पादित गैर-प्रकटीकरण समझौते (NDA) के बिना कभी भी गोपनीय कंपनी या ग्राहक की जानकारी साझा नहीं की जानी चाहिए। 📝',
        'एक संभाव्य विक्रेता एनडीएवर स्वाक्षरी करण्यापूर्वी ग्राहकांची गोपनीय माहिती मागत आहे. तुम्ही काय कराल?',
        'दोन्ही बाजूंनी एनडीएवर स्वाक्षरी करेपर्यंत माहिती शेअर करण्यास नकार द्या.',
        'वाटाघाटी जलद करण्यासाठी माहिती शेअर करा.',
        'तोंडी स्वरूपात फक्त काही गोष्टी सांगा.',
        'त्याऐवजी त्यांना तोंडी वचन देण्यास सांगा.',
        'एनडीए करारावर पूर्ण स्वाक्षरी केल्याशिवाय कंपनी किंवा ग्राहकाची गोपनीय माहिती कधीही शेअर करू नये. 📝'
      ],
      // Legal - Question 2
      [
        'Legal',
        'A customer wants to buy your product, but they forgot to sign the agreement paper. What should you do?',
        'Call the customer and help them sign the paper correctly.',
        'Sign the paper yourself by copying their signature.',
        'Ignore the signature and keep their money.',
        'Lie to your boss that they signed it.',
        0,
        'Never copy another person\'s signature. It is illegal. Helping them sign correctly protects you and the customer. 📝',
        'एक ग्राहक आपका सामान खरीदना चाहता है, लेकिन वह समझौते के कागज पर हस्ताक्षर करना भूल गया। आपको क्या करना चाहिए?',
        'ग्राहक को फोन करेंगे और उन्हें सही तरीके से साइन करने में मदद करेंगे।',
        'उनके हस्ताक्षर की नकल करके खुद साइन कर देंगे।',
        'हस्ताक्षर को अनदेखा करेंगे और उनके पैसे रख लेंगे।',
        'अपने बॉस से झूठ बोलेंगे कि ग्राहक ने साइन कर दिया है।',
        'किसी दूसरे के साइन की नकल करना गैरकानूनी है। ग्राहक से सही साइन करवाना आपको और ग्राहक दोनों को सुरक्षित रखता है। 📝',
        'एक ग्राहक तुमचे सामान खरेदी करू इच्छितो, पण तो कराराच्या कागदावर स्वाक्षरी करायला विसरला. तुम्ही काय कराल?',
        'ग्राहकाला फोन करून त्यांना योग्य प्रकारे स्वाक्षरी करण्यास मदत कराल.',
        'त्यांच्या स्वाक्षरीची नक्कल करून स्वतः साइन कराल.',
        'स्वाक्षरीकडे दुर्लक्ष करून सांगितले गेलेले पैसे ठेवून घ्याल.',
        'तुमच्या बॉसशी खोटे बोलणार की ग्राहकाने साइन केले आहे.',
        'दुसऱ्याच्या सहीची नक्कल करणे बेकायदेशीर आहे. ग्राहकाकडून योग्य रीतीने स्वाक्षरी करून घेणे तुम्हाला आणि ग्राहकाला सुरक्षित ठेवते. 📝'
      ],
      // Real Estate - Question 1
      [
        'Real Estate',
        'A buyer asks if a property has any pending legal disputes. You know there is a minor boundary case. What do you say?',
        'Disclose the dispute fully and explain its current status.',
        'Say there are no disputes to close the deal fast.',
        'Tell them they can check with their lawyer instead.',
        'Lie that the case has already been won.',
        0,
        'Transparency in Real Estate builds long-term trust and protects the company from post-sale legal liability. 🏡',
        'एक खरीदार पूछता है कि क्या किसी संपत्ति पर कोई कानूनी विवाद लंबित है। आप जानते हैं कि एक छोटा सीमा विवाद है। आप क्या कहेंगे?',
        'विवाद का पूरा खुलासा करें और उसकी वर्तमान स्थिति स्पष्ट करें।',
        'सौदा जल्दी पूरा करने के लिए कहें कि कोई विवाद नहीं है।',
        'उनसे कहें कि वे अपने वकील से इसकी जांच करा सकते हैं।',
        'झूठ बोलें कि मामला पहले ही जीता जा चुका है।',
        'रियल एस्टेट में पारदर्शिता दीर्घकालिक विश्वास का निर्माण करती है और बिक्री के बाद कानूनी दायित्वों से बचाती है। 🏡',
        'एक खरेदीदार विचारतो की या जागेवर काही कायदेशीर वाद सुरू आहे का? तुम्हाला माहिती आहे की तिथे एक छोटा सीमा वाद आहे. तुम्ही काय सांगाल?',
        'वादाची पूर्ण माहिती द्या आणि सध्याची कायदेशीर स्थिती स्पष्ट करा.',
        'सौदा लवकर पूर्ण करण्यासाठी कोणताही वाद नसल्याचे सांगा.',
        'त्यांना त्यांच्या वकिलाकडून तपासून घेण्यास सांगा.',
        'खोटे सांगा की केस आम्ही आधीच जिंकलो आहोत.',
        'रिअल इस्टेटमध्ये पारदर्शकता दीर्घकालीन विश्वास निर्माण करते आणि भविष्यातील कायदेशीर त्रासापासून वाचवते. 🏡'
      ],
      // Real Estate - Question 2
      [
        'Real Estate',
        'A client wants to book a flat but has not verified their Aadhaar/PAN details. Can you accept booking amount?',
        'Wait for KYC verification before officially blocking the unit.',
        'Take cash and block the unit immediately.',
        'Accept booking and verify KYC later after registry.',
        'Refuse the client forever.',
        0,
        'Regulatory compliance (RERA/AML) requires proper KYC verification before blocking inventory or accepting bookings. 📑',
        'एक ग्राहक एक फ्लैट बुक करना चाहता है लेकिन उसने अपने आधार/पैन विवरण का सत्यापन नहीं किया है। क्या आप बुकिंग राशि स्वीकार कर सकते हैं?',
        'आधिकारिक तौर पर फ्लैट ब्लॉक करने से पहले केवाईसी सत्यापन की प्रतीक्षा करें।',
        'नकद लें और तुरंत फ्लैट ब्लॉक करें।',
        'बुकिंग स्वीकार करें और रजिस्ट्री के बाद केवाईसी सत्यापित करें।',
        'ग्राहक को हमेशा के लिए मना कर दें।',
        'नियामक अनुपालन (RERA) के तहत बुकिंग स्वीकार करने या इन्वेंट्री ब्लॉक करने से पहले उचित केवाईसी सत्यापन आवश्यक है। 📑',
        'एक ग्राहक फ्लॅट बुक करू इच्छितो परंतु त्याने अद्याप आधार/पॅन पडताळणी केलेली नाही. तुम्ही बुकिंग रक्कम स्वीकारू शकता का?',
        'अधिकृत बुकिंग करण्यापूर्वी केवायसी (KYC) पडताळणीची वाट पाहा.',
        'पैसे घेऊन ताबडतोब फ्लॅट ब्लॉक करा.',
        'बुकिंग स्वीकारा आणि नोंदणीनंतर केवायसी पूर्ण करा.',
        'त्या ग्राहकाला कायमचे नकार द्या.',
        'रेरा (RERA) नियमांनुसार, ग्राहकाचे युनिट ब्लॉक करण्यापूर्वी योग्य केवायसी पडताळणी करणे बंधनकारक आहे. 📑'
      ],
      // Sales - Question 1
      [
        'Sales',
        'A client asks for a feature that is not on the product roadmap. How should you answer?',
        'Be honest about the current features and offer a workaround if possible.',
        'Promise them the feature will be ready in 1 week.',
        'Tell them the product already has that feature.',
        'Ignore their request and change the topic.',
        0,
        'Honesty in sales prevents client churn. Providing realistic timelines builds professional credibility. 🤝',
        'एक ग्राहक एक ऐसी सुविधा की मांग करता है जो उत्पाद के रोडमैप में नहीं है। आपको क्या उत्तर देना चाहिए?',
        'वर्तमान सुविधाओं के बारे में ईमानदार रहें और यदि संभव हो तो वैकल्पिक समाधान पेश करें।',
        'उनसे वादा करें कि सुविधा 1 सप्ताह में तैयार हो जाएगी।',
        'उन्हें बताएं कि उत्पाद में पहले से ही वह सुविधा है।',
        'उनके अनुरोध को अनदेखा करें और विषय बदलें।',
        'बिक्री में ईमानदारी ग्राहकों को बनाए रखने में मदद करती है। यथार्थवादी समयसीमा देने से व्यावसायिक विश्वसनीयता बनती है। 🤝',
        'एक क्लायंट अशा सुविधेची मागणी करत आहे जी प्रॉडक्टच्या रोडमॅपमध्ये नाही. तुम्ही काय उत्तर द्याल?',
        'सध्याच्या फीचर्सबद्दल प्रामाणिक राहा आणि शक्य असल्यास पर्यायी मार्ग सांगा.',
        'त्यांना वचन द्या की हे फीचर १ आठवड्यात तयार होईल.',
        'त्यांना सांगा की प्रॉडक्टमध्ये हे फीचर आधीपासूनच उपलब्ध आहे.',
        'त्यांच्या मागणीकडे दुर्लक्ष करून विषय बदला.',
        'विक्रीत प्रामाणिक राहिल्याने क्लायंट टिकून राहतात. योग्य माहिती दिल्याने व्यावसायिक विश्वासार्हता वाढते. 🤝'
      ],
      // Sales - Question 2
      [
        'Sales',
        'You find a lead that belongs to another sales executive in your team. What is the correct team action?',
        'Transfer the lead details to the assigned colleague.',
        'Call the lead yourself to steal the commission.',
        'Delete the lead so nobody gets it.',
        'Ignore it and let the lead turn cold.',
        0,
        'Cooperation and team integrity always yield better corporate environments and overall conversions. 🏆',
        'आपको एक ऐसी लीड मिलती है जो आपकी टीम के दूसरे सेल्स एक्जीक्यूटिव की है। सही कार्रवाई क्या है?',
        'लीड विवरण संबंधित सहयोगी को स्थानांतरित करें।',
        'कमीशन हासिल करने के लिए लीड को खुद कॉल करें।',
        'लीड को हटा दें ताकि किसी को न मिले।',
        'इसे अनदेखा करें और लीड को ठंडा होने दें।',
        'आपसी सहयोग और टीम की ईमानदारी काम के बेहतर माहौल और अधिक बिक्री का मार्ग प्रशस्त करती है। 🏆',
        'तुम्हाला अशी लीड सापडली जी तुमच्या टीममधील दुसऱ्या सेल्स एक्झिक्युटिव्हची आहे. योग्य कृती काय असेल?',
        'त्या लीडची माहिती संबंधित सहकाऱ्याकडे हस्तांतरित करा.',
        'कमिशन मिळवण्यासाठी स्वतः त्या लीडला कॉल करा.',
        'ती लीड डिलीट करा जेणेकरून कोणालाच मिळणार नाही.',
        'त्याकडे दुर्लक्ष करा आणि लीड वाया जाऊ द्या.',
        'सहकार्य आणि टीममधील प्रामाणिकपणामुळे कामाचे वातावरण सुधारते आणि एकूण विक्रीत वाढ होते. 🏆'
      ],
      // Insurance - Question 1
      [
        'Insurance',
        'An applicant hides a pre-existing medical condition to get a lower health insurance premium. What is the risk?',
        'The claim can be rejected later for non-disclosure of facts.',
        'None, the company will pay anyway.',
        'They will get a discount.',
        'They will be fined by the police.',
        0,
        'Insurance is based on the principle of utmost good faith. Concealing facts can void the entire policy during claims. 🏥',
        'एक आवेदक कम स्वास्थ्य बीमा प्रीमियम पाने के लिए पहले से मौजूद बीमारी को छुपाता है। क्या जोखिम है?',
        'तथ्यों को न बताने के कारण दावा (claim) बाद में खारिज किया जा सकता है।',
        'कोई नहीं, कंपनी वैसे भी भुगतान करेगी।',
        'उन्हें छूट मिलेगी।',
        'पुलिस उन पर जुर्माना लगाएगी।',
        'बीमा विश्वास के सिद्धांत पर आधारित है। तथ्यों को छुपाने से दावे के समय पूरी पॉलिसी अमान्य हो सकती है। 🏥',
        'एका अर्जदाराने कमी प्रीमियम मिळवण्यासाठी पूर्वीची वैद्यकीय माहिती लपवून ठेवली. यात कोणता धोका आहे?',
        'माहिती लपवल्यामुळे भविष्यात त्याचा क्लेम (claim) नाकारला जाऊ शकतो.',
        'काहीही नाही, कंपनी तरीही पैसे देईल.',
        'त्यांना आणखी डिस्काउंट मिळेल.',
        'पोलिस त्यांना दंड आकारतील.',
        'विमा हा परस्परांवरील विश्वासाच्या तत्त्वावर आधारित असतो. माहिती लपवल्यास क्लेमच्या वेळी पॉलिसी रद्द होऊ शकते. 🏥'
      ],
      // Insurance - Question 2
      [
        'Insurance',
        'A claimant submits a repair estimate that is double the actual cost. How should you process it as an assessor?',
        'Request actual bills and approve only verified repair costs.',
        'Approve the double amount to be friendly.',
        'Reject the claim entirely without review.',
        'Split the extra money with the claimant.',
        0,
        'Insurance claims processing must follow strict auditing and verification procedures to prevent fraud and maintain policy terms. 📝',
        'एक दावेदार वास्तविक लागत से दोगुना मरम्मत अनुमान प्रस्तुत करता है। एक मूल्यांकनकर्ता के रूप में आपको इसे कैसे संसाधित करना चाहिए?',
        'वास्तविक बिलों का अनुरोध करें और केवल सत्यापित मरम्मत लागतों को मंजूरी दें।',
        'मित्रता दिखाने के लिए दोगुनी राशि स्वीकृत करें।',
        'बिना समीक्षा किए दावे को पूरी तरह खारिज करें।',
        'अतिरिक्त राशि दावेदार के साथ साझा करें।',
        'धोखाधड़ी को रोकने और नियमों को बनाए रखने के लिए बीमा दावों का सत्यापन सख्त प्रक्रिया के अनुसार होना चाहिए। 📝',
        'एका विमा क्लेम करणाऱ्याने दुरुस्तीचे बिल मूळ खर्चापेक्षा दुप्पट दाखवले. तपास अधिकारी म्हणून तुम्ही काय कराल?',
        'मूळ बिले मागवून घ्या आणि फक्त पडताळणी केलेल्या खर्चालाच मंजुरी द्या.',
        'सलोखा राखण्यासाठी दुप्पट रक्कम मंजूर करा.',
        'कोणतीही शहानिशा न करता क्लेम पूर्णपणे नाकारा.',
        'उर्वरित रक्कम क्लेम करणाऱ्या व्यक्तीसोबत वाटून घ्या.',
        'फसवणूक रोखण्यासाठी विम्याच्या दाव्यांची पडताळणी कडक ऑडिट नियमांनुसारच झाली पाहिजे. 📝'
      ],
      // Hospital - Question 1
      [
        'Hospital',
        'A prominent visitor asks to see the medical chart of a patient who is their neighbor. What is the correct protocol?',
        'Refuse access to protect patient privacy as per HIPAA/consent rules.',
        'Show the chart since they know each other.',
        'Give them a summary of the patient\'s condition verbally.',
        'Let them take a photo of the chart.',
        0,
        'Patient confidentiality is legally protected. Medical records must never be shared without explicit patient consent. 🏥',
        'एक प्रमुख आगंतुक एक मरीज का मेडिकल चार्ट देखने के लिए कहता है जो उनका पड़ोसी है। सही प्रोटोकॉल क्या है?',
        'रोगी की गोपनीयता की रक्षा के लिए अनुमति देने से इनकार करें।',
        'चार्ट दिखाएं क्योंकि वे एक-दूसरे को जानते हैं।',
        'उन्हें मौखिक रूप से मरीज की स्थिति का सारांश दें।',
        'उन्हें चार्ट की तस्वीर लेने दें।',
        'रोगी की गोपनीयता कानूनी रूप से सुरक्षित है। रोगी की स्पष्ट सहमति के बिना चिकित्सा रिकॉर्ड कभी साझा नहीं किए जाने चाहिए। 🏥',
        'रुग्णालयातील एका प्रतिष्ठित पाहुण्याने त्यांच्या शेजारी राहणाऱ्या रुग्णाचा मेडिकल चार्ट पाहण्याची मागणी केली. योग्य नियम काय सांगतो?',
        'रुग्णाच्या गोपनीयतेचे रक्षण करण्यासाठी चार्ट दाखवण्यास नकार द्या.',
        'ते एकमेकांना ओळखत असल्याने चार्ट दाखवा.',
        'त्यांना रुग्णाच्या तब्येतीची तोंडी माहिती द्या.',
        'त्यांना चार्टचा फोटो काढू द्या.',
        'रुग्णाची गोपनीयता कायद्याने सुरक्षित आहे. रुग्णाच्या स्पष्ट संमतीशिवाय वैद्यकीय कागदपत्रे कधीही कोणाशीही शेअर करू नयेत. 🏥'
      ],
      // Hospital - Question 2
      [
        'Hospital',
        'An emergency patient arrives without ID or payment details. What should the triage desk do?',
        'Provide immediate stabilize care and notify medical team.',
        'Wait for a family member to pay deposit.',
        'Call police before starting treatment.',
        'Refuse entry and ask them to go to another clinic.',
        0,
        'Emergency care ethics prioritize life-saving stabilization procedures above financial clearance. 🚑',
        'एक आपातकालीन मरीज बिना किसी पहचान पत्र या भुगतान विवरण के पहुंचता है। ट्राइएज डेस्क को क्या करना चाहिए?',
        'तुरंत जीवन रक्षक प्राथमिक उपचार प्रदान करें और चिकित्सा टीम को सूचित करें।',
        'जमा राशि का भुगतान करने के लिए परिवार के किसी सदस्य की प्रतीक्षा करें।',
        'इलाज शुरू करने से पहले पुलिस को फोन करें।',
        'प्रवेश देने से इनकार करें और उन्हें किसी अन्य क्लिनिक में जाने के लिए कहें।',
        'आपातकालीन चिकित्सा नैतिकता वित्तीय मंजूरी से ऊपर जीवन रक्षक उपचार प्रक्रियाओं को प्राथमिकता देती है। 🚑',
        'एक आपत्कालीन रुग्ण कोणत्याही ओळखपत्राशिवाय किंवा पेमेंटशिवाय दाखल झाला. तिथल्या कर्मचाऱ्यांनी काय करावे?',
        'रुग्णाला त्वरित प्रथमोपचार द्या आणि वैद्यकीय टीमला सूचित करा.',
        'डिपॉझिट भरण्यासाठी कुटुंबातील सदस्याची वाट पाहा.',
        'उपचार सुरू करण्यापूर्वी पोलिसांना कॉल करा.',
        'प्रवेश नाकारा आणि दुसऱ्या दवाखान्यात जाण्यास सांगा.',
        'आपत्कालीन वैद्यकीय नियमांनुसार, पैशांच्या व्यवहारापेक्षा रुग्णाचा जीव वाचवण्याला सर्वोच्च प्राधान्य दिले जाते. 🚑'
      ]
    ];

    for (const q of domainQuestions) {
      await db.execute(`
        INSERT INTO quiz_questions (
          domain, question, option_a, option_b, option_c, option_d, correct_index, explanation,
          question_hi, option_a_hi, option_b_hi, option_c_hi, option_d_hi, explanation_hi,
          question_mr, option_a_mr, option_b_mr, option_c_mr, option_d_mr, explanation_mr,
          points
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 150)
      `, q);
    }

    // Seed mock rewards if empty
    const [rewards] = await db.execute("SELECT id FROM quiz_rewards LIMIT 1");
    if (rewards.length === 0) {
      console.log("🌱 Seeding rewards catalog...");
      await db.execute(`
        INSERT INTO quiz_rewards (id, name, emoji, cost, stock)
        VALUES 
        ('coffee', 'Coffee Voucher', '☕', 120, 8),
        ('hoodie', 'Team Hoodie', '🧥', 300, 3),
        ('movie', 'Movie Pass', '🎬', 220, 5),
        ('lunch', 'Lunch Coupon', '🍱', 180, 4);
      `);
    }

    // Seed dummy employee profiles from eusers if any exist
    const [users] = await db.execute("SELECT user_id, name FROM eusers LIMIT 5");
    for (const user of users) {
      await db.execute(`
        INSERT IGNORE INTO quiz_employee_stats (user_id, username, points, streak)
        VALUES (?, ?, ?, ?)
      `, [user.user_id, user.name, 100 + Math.floor(Math.random() * 400), Math.floor(Math.random() * 5)]);
    }

    console.log("✅ Quiz game database tables created and seeded successfully!");
  } catch (error) {
    console.error("❌ Error setting up quiz database tables:", error);
  }
}

module.exports = setupQuizDB;
