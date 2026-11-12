// App languages. The AI and voice speak all eight; the main screens are translated into French,
// Spanish, Portuguese and Arabic (others fall back to English until they're properly translated).
export const LANGUAGES = [
  ["en", "English", "en-US"], ["fr", "Français", "fr-FR"], ["es", "Español", "es-ES"], ["pt", "Português", "pt-BR"],
  ["ar", "العربية", "ar-SA"], ["sw", "Kiswahili", "sw-KE"], ["ha", "Hausa", "ha-NG"], ["yo", "Yorùbá", "yo-NG"],
];
export const TRANSLATED = ["en", "fr", "es", "pt", "ar"];

const T = {
  fr: {
    Home: "Accueil", Nearby: "À proximité", Garage: "Garage", Profile: "Profil", AI: "IA",
    "Hi": "Salut", "Here's your car today.": "Voici votre voiture aujourd'hui.", "Your car needs a look.": "Votre voiture a besoin d'un contrôle.", "Something's overdue.": "Un entretien est en retard.",
    "Vehicle health": "Santé du véhicule", "Health report": "Rapport de santé", "Scan car": "Scanner", "Adapter": "Adaptateur", "Trip": "Trajet", "Car Mode": "Mode voiture",
    "Connect": "Connecter", "Connected": "Connecté", "Start": "Démarrer", "Radio & voice": "Radio et voix", "AI Vision Scan": "Scan visuel IA", "Open AI": "Ouvrir l'IA",
    "Snap a warning light or damage — get a verdict": "Photographiez un voyant ou un dégât — obtenez un verdict",
    "Search mechanics, parts, tyres...": "Mécaniciens, pièces, pneus...", "Fuel & battery": "Carburant et batterie", "This week": "Cette semaine",
    "Service centres": "Centres de service", "Mechanics near me": "Mécaniciens proches", "Live dashboard": "Tableau de bord",
    "AI Diagnostics": "Diagnostic IA", "Smart Garage": "Garage intelligent", "Nearby Help": "Aide à proximité", "Market": "Marché", "Places": "Lieux",
    "Account details": "Compte", "Appearance": "Apparence", "Units": "Unités", "Notifications": "Notifications", "Language": "Langue",
    "Costs & expenses": "Dépenses", "Documents & warranty": "Documents et garantie", "Privacy & security": "Confidentialité", "Help & support": "Aide", "Sign out": "Se déconnecter",
    "Motiq Pro": "Motiq Pro", "Upgrade": "Passer à Pro", "Admin": "Admin", "Get quotes": "Obtenir des devis", "Share this car": "Partager cette voiture", "Join a shared car": "Rejoindre une voiture",
  },
  es: {
    Home: "Inicio", Nearby: "Cerca", Garage: "Garaje", Profile: "Perfil", AI: "IA",
    "Hi": "Hola", "Here's your car today.": "Así está tu coche hoy.", "Your car needs a look.": "Tu coche necesita una revisión.", "Something's overdue.": "Hay algo atrasado.",
    "Vehicle health": "Salud del vehículo", "Health report": "Informe de salud", "Scan car": "Escanear", "Adapter": "Adaptador", "Trip": "Viaje", "Car Mode": "Modo coche",
    "Connect": "Conectar", "Connected": "Conectado", "Start": "Empezar", "Radio & voice": "Radio y voz", "AI Vision Scan": "Escaneo visual IA", "Open AI": "Abrir IA",
    "Snap a warning light or damage — get a verdict": "Fotografía un testigo o un daño — recibe un veredicto",
    "Search mechanics, parts, tyres...": "Mecánicos, repuestos, neumáticos...", "Fuel & battery": "Combustible y batería", "This week": "Esta semana",
    "Service centres": "Talleres oficiales", "Mechanics near me": "Mecánicos cerca", "Live dashboard": "Panel en vivo",
    "AI Diagnostics": "Diagnóstico IA", "Smart Garage": "Garaje inteligente", "Nearby Help": "Ayuda cercana", "Market": "Mercado", "Places": "Lugares",
    "Account details": "Cuenta", "Appearance": "Apariencia", "Units": "Unidades", "Notifications": "Notificaciones", "Language": "Idioma",
    "Costs & expenses": "Gastos", "Documents & warranty": "Documentos y garantía", "Privacy & security": "Privacidad", "Help & support": "Ayuda", "Sign out": "Cerrar sesión",
    "Motiq Pro": "Motiq Pro", "Upgrade": "Mejorar a Pro", "Admin": "Admin", "Get quotes": "Pedir presupuestos", "Share this car": "Compartir este coche", "Join a shared car": "Unirse a un coche",
  },
  pt: {
    Home: "Início", Nearby: "Perto", Garage: "Garagem", Profile: "Perfil", AI: "IA",
    "Hi": "Olá", "Here's your car today.": "Este é o seu carro hoje.", "Your car needs a look.": "O seu carro precisa de atenção.", "Something's overdue.": "Há algo atrasado.",
    "Vehicle health": "Saúde do veículo", "Health report": "Relatório", "Scan car": "Escanear", "Adapter": "Adaptador", "Trip": "Viagem", "Car Mode": "Modo carro",
    "Connect": "Ligar", "Connected": "Ligado", "Start": "Começar", "Radio & voice": "Rádio e voz", "AI Vision Scan": "Análise visual IA", "Open AI": "Abrir IA",
    "Snap a warning light or damage — get a verdict": "Fotografe uma luz de aviso ou dano — receba um veredicto",
    "Search mechanics, parts, tyres...": "Mecânicos, peças, pneus...", "Fuel & battery": "Combustível e bateria", "This week": "Esta semana",
    "Service centres": "Oficinas", "Mechanics near me": "Mecânicos perto", "Live dashboard": "Painel ao vivo",
    "AI Diagnostics": "Diagnóstico IA", "Smart Garage": "Garagem inteligente", "Nearby Help": "Ajuda perto", "Market": "Mercado", "Places": "Locais",
    "Account details": "Conta", "Appearance": "Aparência", "Units": "Unidades", "Notifications": "Notificações", "Language": "Idioma",
    "Costs & expenses": "Despesas", "Documents & warranty": "Documentos e garantia", "Privacy & security": "Privacidade", "Help & support": "Ajuda", "Sign out": "Sair",
    "Motiq Pro": "Motiq Pro", "Upgrade": "Mudar para Pro", "Admin": "Admin", "Get quotes": "Pedir orçamentos", "Share this car": "Partilhar este carro", "Join a shared car": "Juntar-se a um carro",
  },
  ar: {
    Home: "الرئيسية", Nearby: "بالقرب", Garage: "المرآب", Profile: "حسابي", AI: "الذكاء",
    "Hi": "مرحبًا", "Here's your car today.": "هذه حالة سيارتك اليوم.", "Your car needs a look.": "سيارتك تحتاج إلى فحص.", "Something's overdue.": "هناك صيانة متأخرة.",
    "Vehicle health": "صحة السيارة", "Health report": "تقرير الصحة", "Scan car": "افحص السيارة", "Adapter": "المحول", "Trip": "رحلة", "Car Mode": "وضع القيادة",
    "Connect": "اتصال", "Connected": "متصل", "Start": "ابدأ", "Radio & voice": "راديو وصوت", "AI Vision Scan": "فحص بالصورة", "Open AI": "افتح",
    "Snap a warning light or damage — get a verdict": "صوّر ضوء تحذير أو ضررًا واحصل على حكم",
    "Search mechanics, parts, tyres...": "ميكانيكيون، قطع، إطارات...", "Fuel & battery": "الوقود والبطارية", "This week": "هذا الأسبوع",
    "Service centres": "مراكز الخدمة", "Mechanics near me": "ميكانيكي قريب", "Live dashboard": "لوحة مباشرة",
    "AI Diagnostics": "تشخيص ذكي", "Smart Garage": "المرآب الذكي", "Nearby Help": "مساعدة قريبة", "Market": "السوق", "Places": "أماكن",
    "Account details": "الحساب", "Appearance": "المظهر", "Units": "الوحدات", "Notifications": "الإشعارات", "Language": "اللغة",
    "Costs & expenses": "المصاريف", "Documents & warranty": "المستندات والضمان", "Privacy & security": "الخصوصية", "Help & support": "المساعدة", "Sign out": "تسجيل الخروج",
    "Motiq Pro": "موتيك برو", "Upgrade": "ترقية", "Admin": "الإدارة", "Get quotes": "اطلب عروض أسعار", "Share this car": "شارك السيارة", "Join a shared car": "انضم إلى سيارة",
  },
};

let current = "en";
export function setLanguage(code) {
  current = code || "en";
  if (typeof document !== "undefined") { document.documentElement.lang = current; document.documentElement.dir = current === "ar" ? "rtl" : "ltr"; }
}
export const language = () => current;
export const t = (s) => (T[current] && T[current][s]) || s;
export const speechLang = () => (LANGUAGES.find((l) => l[0] === current) || LANGUAGES[0])[2];
