import os
from fpdf import FPDF
from datetime import datetime

class QuotationPDF(FPDF):
    def header(self):
        # Logo
        logo_path = r"C:\Users\Travis\.gemini\antigravity\brain\d616fb19-4f3e-4f03-abeb-448360bba417\sarsoop_labs_logo_1777913361923.png"
        if os.path.exists(logo_path):
            self.image(logo_path, 10, 8, 33)
        
        self.set_font('helvetica', 'B', 20)
        self.cell(80)
        self.set_text_color(20, 40, 100)
        self.cell(30, 10, 'COTIZACIÓN', 0, 0, 'C')
        self.ln(20)

    def footer(self):
        self.set_y(-15)
        self.set_font('helvetica', 'I', 8)
        self.set_text_color(128)
        self.cell(0, 10, f'Página {self.page_no()} / {{nb}}', 0, 0, 'C')

def generate_quotation():
    pdf = QuotationPDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    
    # Company Info
    pdf.set_font('helvetica', 'B', 12)
    pdf.set_text_color(0)
    pdf.cell(0, 10, 'Sarsoop Labs S.A.S.', 0, 1)
    pdf.set_font('helvetica', '', 10)
    pdf.cell(0, 5, 'NIT: 901.234.567-8', 0, 1)
    pdf.cell(0, 5, 'Calle 100 # 15-20, Bogotá, Colombia', 0, 1)
    pdf.cell(0, 5, 'Email: contacto@sarsoop.com', 0, 1)
    pdf.cell(0, 5, 'Tel: +57 300 123 4567', 0, 1)
    
    pdf.ln(10)
    
    # Client Info
    pdf.set_fill_color(240, 240, 240)
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(0, 10, 'CLIENTE:', 0, 1, 'L', True)
    pdf.set_font('helvetica', '', 11)
    pdf.cell(0, 7, 'SSITRAM', 0, 1)
    pdf.cell(0, 7, 'Sindicato de Trabajadores', 0, 1)
    
    pdf.ln(10)
    
    # Quotation details
    pdf.set_font('helvetica', 'B', 11)
    pdf.cell(40, 10, 'Fecha:', 0, 0)
    pdf.set_font('helvetica', '', 11)
    pdf.cell(0, 10, datetime.now().strftime('%d/%m/%Y'), 0, 1)
    
    pdf.set_font('helvetica', 'B', 11)
    pdf.cell(40, 10, 'Vencimiento:', 0, 0)
    pdf.set_font('helvetica', '', 11)
    pdf.cell(0, 10, '30 días a partir de la fecha', 0, 1)
    
    pdf.ln(10)
    
    # Table Header
    pdf.set_fill_color(20, 40, 100)
    pdf.set_text_color(255)
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(130, 10, 'Descripción', 1, 0, 'C', True)
    pdf.cell(60, 10, 'Total (COP)', 1, 1, 'C', True)
    
    # Table Content
    pdf.set_text_color(0)
    pdf.set_font('helvetica', '', 11)
    pdf.cell(130, 20, 'Licencia Sistema SSITRAM AMS + Configuración de Correo Corporativo', 1, 0, 'L')
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(60, 20, '$ 1.250.000', 1, 1, 'R')
    
    pdf.ln(10)
    
    # Total
    pdf.set_font('helvetica', 'B', 12)
    pdf.cell(130, 10, 'TOTAL', 0, 0, 'R')
    pdf.cell(60, 10, '$ 1.250.000', 1, 1, 'R')
    
    pdf.ln(20)
    
    # Terms
    pdf.set_font('helvetica', 'B', 10)
    pdf.cell(0, 10, 'Términos y Condiciones:', 0, 1)
    pdf.set_font('helvetica', '', 9)
    pdf.multi_cell(0, 5, '1. El pago debe realizarse en un plazo de 30 días.\n2. Incluye soporte técnico básico por 12 meses.\n3. La implementación se realizará en un plazo de 5 días hábiles tras la aprobación.')
    
    # Output
    output_path = r"c:\Users\Travis\Desktop\soop_mail\docs\cotizacion_ssitram.pdf"
    pdf.output(output_path)
    print(f"Quotation generated at: {output_path}")

if __name__ == "__main__":
    generate_quotation()
