import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface EbookOutline {
  title: string;
  chapters: {
    title: string;
    sections: {
      title: string;
    }[];
  }[];
}

export async function generateOutline(topic: string, type: string, targetPages: number, isPrototype: boolean = false): Promise<EbookOutline> {
  const chaptersCount = isPrototype ? 2 : Math.max(10, Math.ceil(targetPages / 5));
  
  const prompt = `Agis comme un auteur expert en ${type}. Crée un plan détaillé pour un ebook sur le sujet : "${topic}".
L'ebook doit faire exactement ${targetPages} pages au final.
Génère un plan de ${chaptersCount} chapitres, avec au moins 5 sous-sections par chapitre pour garantir la profondeur.
Rédige tout en français.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Le titre de l'ebook" },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Le titre du chapitre" },
                sections: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "Le titre de la sous-section" }
                    },
                    required: ["title"]
                  }
                }
              },
              required: ["title", "sections"]
            }
          }
        },
        required: ["title", "chapters"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse outline JSON", e);
    throw new Error("Erreur lors de la génération du plan.");
  }
}

export async function generateChapterContent(ebookTitle: string, chapterTitle: string, sections: string[], targetChapterPages: number, isPrototype: boolean = false): Promise<string> {
  const sectionsList = sections.map(s => `- ${s}`).join('\n');
  const targetWords = isPrototype ? 300 : targetChapterPages * 450; // Approx 450 words per page

  const prompt = `Agis comme un auteur expert. Rédige le contenu détaillé du chapitre "${chapterTitle}" pour un ebook intitulé "${ebookTitle}".
Ce chapitre doit couvrir les sous-sections suivantes :
${sectionsList}

Le contenu doit être extrêmement riche, informatif et basé sur l'actualité de 2026.
OBJECTIF DE LONGUEUR : Tu dois rédiger environ ${targetWords} mots pour ce chapitre spécifique.
C'est CRITIQUE pour atteindre l'objectif de pagination de l'ebook.
Structure le texte avec des paragraphes longs et détaillés, des analyses approfondies et des exemples concrets.
Rédige tout en français.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  return response.text || "";
}

export async function generateImage(prompt: string, style: string = "professionnel"): Promise<string> {
  const stylePrompts: Record<string, string> = {
    "réel": "photographie ultra réaliste, haute résolution, éclairage studio",
    "minimaliste": "style minimaliste, épuré, design moderne, aplats de couleurs",
    "business": "style corporate business, professionnel, graphique, propre",
    "3d": "rendu 3D, style tech moderne, vibrant, détaillé",
    "infographie": "style infographie, icônes propres, informatif, vectoriel",
    "artistique": "illustration artistique, peinture numérique, créatif, expressif"
  };

  const selectedStyle = stylePrompts[style.toLowerCase()] || stylePrompts["business"];

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [{ text: `Une illustration pour un livre. Sujet: ${prompt}. Style: ${selectedStyle}. Qualité premium, 4k.` }],
    },
    config: {
      // @ts-ignore
      imageConfig: {
        aspectRatio: "16:9",
      }
    }
  });
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Échec de la génération de l'image");
}

export async function refineText(text: string, action: 'rewrite' | 'simplify' | 'enrich' | 'formal' | 'storytelling'): Promise<string> {
  const prompts = {
    rewrite: "Réécris ce texte pour le rendre plus percutant et professionnel.",
    simplify: "Simplifie ce texte pour le rendre accessible à un débutant tout en gardant l'expertise.",
    enrich: "Enrichis ce texte avec plus de détails, d'exemples et de profondeur pédagogique.",
    formal: "Adapte le ton de ce texte pour qu'il soit très formel et académique.",
    storytelling: "Réécris ce texte en utilisant des techniques de storytelling pour captiver le lecteur."
  };

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `${prompts[action]}\n\nTexte original :\n${text}`,
  });

  return response.text || text;
}

export async function generateMarketingAssets(topic: string, ebookTitle: string) {
  const prompt = `Génère des outils marketing pour l'ebook intitulé "${ebookTitle}" sur le sujet "${topic}".
Retourne un objet JSON contenant :
- kdpDescription: Une description optimisée pour Amazon KDP (HTML autorisé).
- seoKeywords: Un tableau de 10 mots-clés SEO.
- salesPage: Un plan de page de vente persuasif (titre, bénéfices, appel à l'action).
- marketingEmail: Un email de lancement captivant.
- suggestedPrice: Une estimation de prix conseillé en Euros.
Rédige tout en français.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          kdpDescription: { type: Type.STRING },
          seoKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          salesPage: { type: Type.STRING },
          marketingEmail: { type: Type.STRING },
          suggestedPrice: { type: Type.STRING }
        },
        required: ["kdpDescription", "seoKeywords", "salesPage", "marketingEmail", "suggestedPrice"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch {
    return null;
  }
}

export async function generateFAQ(chapterContent: string): Promise<string> {
  const prompt = `Génère une section FAQ (3-5 questions/réponses) basée sur le contenu suivant. Les questions doivent être pertinentes pour un lecteur qui souhaite approfondir le sujet.\n\nContenu :\n${chapterContent}`;
  
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
  });

  return response.text || "";
}


export async function generateChartData(topic: string): Promise<{ type: string, data: any, title: string } | null> {
  const prompt = `Génère des données fictives mais réalistes pour un graphique lié au sujet : "${topic}".
Le graphique doit être pertinent pour un ebook professionnel.
Retourne un objet JSON avec :
- type: "bar" | "line" | "pie"
- title: le titre du graphique
- data: un tableau d'objets { label: string, value: number }
Rédige tout en français.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["bar", "line", "pie"] },
          title: { type: Type.STRING },
          data: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.NUMBER }
              },
              required: ["label", "value"]
            }
          }
        },
        required: ["type", "title", "data"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "null");
  } catch {
    return null;
  }
}
