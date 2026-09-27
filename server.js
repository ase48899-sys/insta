import express from "express";
import multer from "multer";
import session from "express-session";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ==========================================
// Middleware
// ==========================================

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));


// ==========================================
// Session
// ==========================================

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "instagram-secret-change-me",

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure: false,
            sameSite: "lax"
        }
    })
);


// ==========================================
// Public folder
// ==========================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ==========================================
// Upload folder
// ==========================================

const uploadDir =
    path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
        recursive: true
    });
}


app.use(
    "/uploads",
    express.static(uploadDir)
);


// ==========================================
// Multer
// ==========================================

const storage =
    multer.diskStorage({

        destination:
            function (req, file, cb) {

                cb(
                    null,
                    uploadDir
                );

            },

        filename:
            function (req, file, cb) {

                const extension =
                    path.extname(
                        file.originalname
                    );

                const filename =
                    Date.now() +
                    "-" +
                    Math.random()
                        .toString(36)
                        .substring(2, 9) +
                    extension;

                cb(
                    null,
                    filename
                );

            }

    });


const upload =
    multer({

        storage: storage,

        limits: {
            fileSize:
                500 * 1024 * 1024
        },

        fileFilter:
            function (
                req,
                file,
                cb
            ) {

                if (
                    file.mimetype.startsWith(
                        "video/"
                    )
                ) {

                    cb(
                        null,
                        true
                    );

                } else {

                    cb(
                        new Error(
                            "يسمح بملفات الفيديو فقط"
                        )
                    );

                }

            }

    });


// ==========================================
// الصفحة الرئيسية
// ==========================================

app.get(
    "/",
    function (req, res) {

        const indexPath =
            path.join(
                __dirname,
                "public",
                "index.html"
            );

        if (
            fs.existsSync(indexPath)
        ) {

            return res.sendFile(
                indexPath
            );

        }

        res.send(`
            <h1>Instagram Story Uploader</h1>
            <p>السيرفر يعمل بنجاح ✅</p>
        `);

    }
);


// ==========================================
// فحص السيرفر
// ==========================================

app.get(
    "/api/status",
    function (req, res) {

        res.json({

            success: true,

            server:
                "online",

            instagram:
                Boolean(
                    req.session.instagram
                )

        });

    }
);


// ==========================================
// رفع الفيديو
// ==========================================

app.post(
    "/upload-video",
    upload.single("video"),

    function (req, res) {

        try {

            if (!req.file) {

                return res.status(400)
                    .json({

                        success: false,

                        message:
                            "لم يتم اختيار فيديو"

                    });

            }


            const host =
                req.get("host");

            const protocol =
                req.headers["x-forwarded-proto"] ||
                req.protocol;


            const videoURL =
                `${protocol}://${host}/uploads/${encodeURIComponent(req.file.filename)}`;


            req.session.video = {

                filename:
                    req.file.filename,

                originalName:
                    req.file.originalname,

                size:
                    req.file.size,

                type:
                    req.file.mimetype,

                url:
                    videoURL

            };


            res.json({

                success: true,

                message:
                    "تم رفع الفيديو",

                videoURL:
                    videoURL,

                filename:
                    req.file.filename

            });

        }

        catch (error) {

            console.error(
                error
            );

            res.status(500)
                .json({

                    success: false,

                    message:
                        "حدث خطأ أثناء رفع الفيديو"

                });

        }

    }
);


// ==========================================
// Meta Login
// ==========================================

app.get(
    "/auth/meta",
    function (req, res) {

        const appId =
            process.env.META_APP_ID;

        const redirectURI =
            process.env.META_REDIRECT_URI;


        if (
            !appId ||
            !redirectURI
        ) {

            return res.status(500)
                .send(
                    "META_APP_ID أو META_REDIRECT_URI غير موجود في Render."
                );

        }


        const state =
            Math.random()
                .toString(36)
                .substring(2) +
            Date.now();


        req.session.oauthState =
            state;


        const params =
            new URLSearchParams({

                client_id:
                    appId,

                redirect_uri:
                    redirectURI,

                state:
                    state,

                response_type:
                    "code"

            });


        const url =
            "https://www.facebook.com/v24.0/dialog/oauth?" +
            params.toString();


        res.redirect(
            url
        );

    }
);


// ==========================================
// Meta Callback
// ==========================================

app.get(
    "/auth/meta/callback",

    async function (
        req,
        res
    ) {

        try {

            const {
                code,
                state
            } = req.query;


            if (!code) {

                return res.status(400)
                    .send(
                        "لم يتم استلام code من Meta."
                    );

            }


            if (
                !state ||
                state !==
                    req.session.oauthState
            ) {

                return res.status(403)
                    .send(
                        "OAuth state غير صالح."
                    );

            }


            delete req.session.oauthState;


            const appId =
                process.env.META_APP_ID;

            const appSecret =
                process.env.META_APP_SECRET;

            const redirectURI =
                process.env.META_REDIRECT_URI;


            const params =
                new URLSearchParams({

                    client_id:
                        appId,

                    client_secret:
                        appSecret,

                    redirect_uri:
                        redirectURI,

                    code:
                        code

                });


            const response =
                await fetch(
                    "https://graph.facebook.com/v24.0/oauth/access_token?" +
                    params.toString()
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.access_token
            ) {

                console.error(
                    data
                );

                return res.status(500)
                    .send(
                        "فشل الحصول على Access Token."
                    );

            }


            req.session.metaToken =
                data.access_token;


            req.session.instagram = {
                connected: true
            };


            res.redirect(
                "/?connected=1"
            );

        }

        catch (error) {

            console.error(
                error
            );

            res.status(500)
                .send(
                    "حدث خطأ أثناء الاتصال بـ Meta."
                );

        }

    }
);


// ==========================================
// حالة الحساب
// ==========================================

app.get(
    "/api/account",

    function (
        req,
        res
    ) {

        res.json({

            connected:
                Boolean(
                    req.session.metaToken
                )

        });

    }
);


// ==========================================
// Publish Story
// ==========================================

app.post(
    "/publish-story",

    async function (
        req,
        res
    ) {

        if (
            !req.session.metaToken
        ) {

            return res.status(401)
                .json({

                    success: false,

                    message:
                        "يجب تسجيل الدخول إلى Meta أولاً."

                });

        }


        if (
            !req.session.video
        ) {

            return res.status(400)
                .json({

                    success: false,

                    message:
                        "يجب رفع فيديو أولاً."

                });

        }


        /*
        ==========================================
        هنا سنضع كود Instagram Graph API
        الرسمي في الخطوة القادمة.

        الخطوات ستكون:

        1. الحصول على Instagram User ID

        2. إنشاء Media Container

        3. media_type = STORIES

        4. video_url = رابط الفيديو

        5. انتظار تجهيز الفيديو

        6. media_publish

        ==========================================
        */


        res.json({

            success: false,

            message:
                "جاهز للربط مع Instagram API."

        });

    }
);


// ==========================================
// Logout
// ==========================================

app.get(
    "/logout",

    function (
        req,
        res
    ) {

        req.session.destroy(
            function () {

                res.redirect(
                    "/"
                );

            }
        );

    }
);


// ==========================================
// Error Handler
// ==========================================

app.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            error
        );

        res.status(500)
            .json({

                success: false,

                message:
                    error.message ||
                    "حدث خطأ غير معروف."

            });

    }
);


// ==========================================
// Start Server
// ==========================================

app.listen(
    PORT,
    "0.0.0.0",

    function () {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);
