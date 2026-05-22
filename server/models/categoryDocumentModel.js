const db=require('../config/database')

class CategoryDocumentModel {
    async createCategoryDocument(data) {
        try {
            const categoryID = data.categoryID ? data.categoryID : ''; 
            const documentType = data.documentType ? data.documentType : ''; 

            const [result] = await db.execute(
                `INSERT INTO category_documents (category_id,document_type,status created_at) VALUES (?,?,1, NOW())`, 
                [categoryID,documentType]
            );

            return result.insertId;  
        } catch (error) {
            console.error("Error creating category Documents:", error);
            throw error; 
        }
    }
}

module.exports= new CategoryDocumentModel;