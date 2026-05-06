import os
from fpdf import FPDF
from datetime import datetime

class ProposalPDF(FPDF):
    def header(self):
        # Line art image
        img_path = r"C:\Users\Travis\.gemini\antigravity\brain\d616fb19-4f3e-4f03-abeb-448360bba417\minimalist_tech_lineart_1777913578926.png"
        if os.path.exists(img_path):
            self.image(img_path, 150, 10, 45)
        
        self.set_font('helvetica', 'B', 16)
        self.set_text_color(0)
        self.cell(0, 10, 'PROPUESTA COMERCIAL', 0, 1, 'L')
        self.set_font('helvetica', '', 10)
        self.cell(0, 5, 'Soop Mail + SSITRAM Integration', 0, 1, 'L')
        self.ln(10)

    def footer(self):
        self.set_y(-25)
        self.set_font('helvetica', 'I', 8)
        self.set_text_color(100)
        self.cell(0, 10, 'Sarsoop Labs - Innovación en Comunicaciones', 0, 1, 'C')
        self.cell(0, 10, f'Página {self.page_no()} / {{nb}}', 0, 0, 'C')

def generate_proposal():
    pdf = ProposalPDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    
    # Header Section
    pdf.set_draw_color(0)
    pdf.line(10, 35, 200, 35)
    pdf.ln(5)
    
    # What it has (Features)
    pdf.set_font('helvetica', 'B', 14)
    pdf.cell(0, 10, '¿Qué incluye el sistema?', 0, 1)
    pdf.ln(2)
    
    features = [
        ("Panel Administrativo", "Interfaz moderna para gestionar cuentas y configuraciones."),
        ("Correo Corporativo", "Configuración completa de servidor de correo seguro."),
        ("Gestión de Usuarios", "Creación, edición y eliminación de cuentas con un clic."),
        ("Estadísticas", "Visualización en tiempo real del uso de disco y tráfico."),
        ("Seguridad", "Cifrado SSL/TLS y filtros de protección integrados."),
        ("Alias y Reenvíos", "Redirección inteligente de correos y cuentas múltiples.")
    ]
    
    pdf.set_font('helvetica', '', 11)
    for title, desc in features:
        pdf.set_font('helvetica', 'B', 11)
        pdf.cell(50, 7, f"- {title}:", 0, 0)
        pdf.set_font('helvetica', '', 11)
        pdf.cell(0, 7, desc, 0, 1)
    
    pdf.ln(10)
    
    # Aesthetic Note (Modern/B&W)
    pdf.set_fill_color(250, 250, 250)
    pdf.set_font('helvetica', 'I', 10)
    pdf.multi_cell(0, 7, 'El sistema está diseñado bajo una estética minimalista, priorizando la usabilidad y el rendimiento técnico, ideal para entornos corporativos modernos.', 0, 'L', True)
    
    pdf.ln(10)
    
    # Costs
    pdf.set_font('helvetica', 'B', 14)
    pdf.cell(0, 10, 'Inversión', 0, 1)
    
    pdf.set_draw_color(0)
    pdf.set_fill_color(0)
    pdf.set_text_color(255)
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(140, 10, ' Concepto', 1, 0, 'L', True)
    pdf.cell(50, 10, 'Valor (COP) ', 1, 1, 'R', True)
    
    pdf.set_text_color(0)
    pdf.set_font('helvetica', '', 11)
    pdf.cell(140, 12, ' Licencia Permanente Soop Mail + AMS SSITRAM', 1, 0, 'L')
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(50, 12, '$ 1.250.000 ', 1, 1, 'R')
    
    pdf.ln(5)
    
    # Conditions
    pdf.set_font('helvetica', 'B', 11)
    pdf.cell(0, 10, 'Condiciones del Servicio:', 0, 1)
    pdf.set_font('helvetica', '', 11)
    
    # Bullet points with bold highlights
    pdf.set_font('helvetica', 'B', 11)
    pdf.cell(10, 7, '-', 0, 0)
    pdf.set_font('helvetica', '', 11)
    pdf.cell(0, 7, 'Hosting/Servidor: A cargo del CLIENTE.', 0, 1)
    
    pdf.set_font('helvetica', 'B', 11)
    pdf.cell(10, 7, '-', 0, 0)
    pdf.set_font('helvetica', '', 11)
    pdf.set_text_color(0, 100, 0) # Green for FREE note
    pdf.cell(0, 7, 'Despliegue e Instalación: GRATUITO.', 0, 1)
    pdf.set_text_color(0)
    
    pdf.ln(15)
    
    # Closing
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(0, 10, 'Aprobado por: __________________________', 0, 1, 'R')
    
    # Output
    output_path = r"c:\Users\Travis\Desktop\soop_mail\docs\propuesta_ssitram_simple.pdf"
    pdf.output(output_path)
    print(f"Proposal generated at: {output_path}")

if __name__ == "__main__":
    generate_proposal()
