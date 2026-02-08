const benefits = [
  {
    icon: "schedule",
    title: "Agendamento 24h",
    description: "Seu cliente marca horário mesmo quando você está descansando.",
  },
  {
    icon: "dashboard_customize",
    title: "Painel Admin",
    description: "Controle total do seu negócio com facilidade e rapidez extrema.",
  },
  {
    icon: "content_cut",
    title: "Gestão de Serviços",
    description: "Cadastre e gerencie seus serviços de forma 100% personalizada.",
  },
  {
    icon: "calendar_view_week",
    title: "Visão Semanal",
    description: "Visualize sua agenda do jeito que preferir para melhor controle.",
  },
  {
    icon: "groups",
    title: "Equipe Organizada",
    description: "Gerencie profissionais e comissões sem qualquer complicação.",
  },
];

const steps = [
  {
    title: "Cadastre seu salão",
    description: "Crie sua conta em segundos e comece a profissionalizar sua agenda digital.",
  },
  {
    title: "Configure serviços",
    description: "Personalize horários, preços e profissionais da sua equipe de forma intuitiva.",
  },
  {
    title: "Receba agendamentos",
    description: "Compartilhe seu link exclusivo e veja sua agenda encher automaticamente.",
  },
];

const testimonials = [
  {
    name: "Mariana Silva",
    role: "Studio Hair Premium",
    quote:
      '"Minha vida mudou. Não preciso mais responder WhatsApp no domingo à noite. O Agendixx faz tudo sozinho."',
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCj7USqC9Zt-otbDR932WLqgEYI5q2V45qvMvzoIth8h3tybiHK5WEAvuAEl5ps_uo116F9o67-597Rb7RpdUrFAR-GaMJfuZsh-OPvOl0xZOvCpvKClUxxmdR8uz9JG8yri27SG75nauLJH3zC4zwYpsms_jCBn1kb6rGo8Os995EFw3_9Xv9c5Nn765UyL0A4Tk-Nx_MikwT31kCPF1O5xi0ZVvFivTFGgzulBG4nbId3Q-ZORFcH82WmjIVRp7gF-JP2lJITl-4",
  },
  {
    name: "Ricardo Alvez",
    role: "Barbeiro de Elite",
    quote:
      '"O custo-benefício é imbatível. Com um corte de cabelo eu pago o mês inteiro da plataforma."',
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBQI7zfJHqYAZM2P-F0iZd7Vs2rPcNQ9zRzTh1n0ozZaY0_nrzThzQP3MHth93M3y8NOKL5M9-URZ4HsfOYTRfduv1mWzsVM1q7HO1tBiPGzjBSBTGtfEosWgO1rXhnyCT6BNxzrE_KwPiPIItAxmLPQyeFhJSIzSsX61FcA1KolRI4TC8FKUZINcp8zaNOYdYSSiQPETwT5JCnMSob3GTqGZHfzsuSQuIqDj2iOH5bJKIUjsgQT2GCMv9KyXqmWIIiZUp5jPDEljI",
  },
  {
    name: "Juliana Costa",
    role: "Nail Designer Expert",
    quote:
      '"Design limpo e muito fácil de usar. Minhas clientes amaram a facilidade de agendar pelo celular."',
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBVZAz4HpO3KS_g6VWdHxN7NUZLz_ZM-9fRSSbcjWB0Ky1Jv9LO53ImNs7ytKuvzVLqJ2uw0pkePhvNCDVJ3gOP8kbXAROBU2Ovvu82Q9xFdh3Wh_VL-4vjlKqCfN5IIbk3E2T5N9qDr0FCvdF5ulLAMqaACYlMt9_Y7F59eyFxRSKHJ0xmNsxc7ZL2DVRYrPqppNyZWR_VY4wl9m_GsNiyu5Qu392EWdBLo6O_OGMY4vGendPkDFgNdpZD_Hn3WgbjhhQcihnKQI4",
  },
];

const faqs = [
  {
    question: "Como funciona o teste gratuito?",
    answer:
      "Você pode utilizar todas as funcionalidades por 7 dias sem precisar cadastrar cartão de crédito. Se gostar, é só escolher um plano.",
  },
  {
    question: "Posso cancelar a qualquer momento?",
    answer:
      "Sim! Não temos contrato de fidelidade. Você paga mês a mês e pode cancelar quando quiser sem multas.",
  },
  {
    question: "As notificações de WhatsApp são pagas à parte?",
    answer: "Não, os lembretes automáticos já estão inclusos no valor mensal da sua assinatura por profissional.",
  },
];

export default function Home() {
  return (
    <div className="bg-background-light text-text-main min-h-screen">
      <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
        <header className="sticky top-0 z-50 w-full bg-background-light/90 backdrop-blur-md border-b border-border-light px-6 lg:px-10 py-3">
          <div className="flex items-center justify-between max-w-[1200px] mx-auto">
            <div className="flex items-center gap-2">
              <div className="size-8 text-primary">
                <svg fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
                </svg>
              </div>
              <h2 className="text-xl font-extrabold tracking-tight">Agendixx</h2>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a className="text-sm font-semibold hover:text-primary transition-colors" href="#beneficios">
                Benefícios
              </a>
              <a className="text-sm font-semibold hover:text-primary transition-colors" href="#como-funciona">
                Como Funciona
              </a>
              <a className="text-sm font-semibold hover:text-primary transition-colors" href="#precos">
                Preços
              </a>
              <a
                href="/admin/register"
                className="bg-primary text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:brightness-110 transition-all"
              >
                Quero testar agora
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          <section className="max-w-[1200px] mx-auto px-6 lg:px-10 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4">
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold uppercase tracking-widest w-fit">
                  Gestão Inteligente
                </span>
                <h1 className="text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight">
                  Agendamento online simples, rápido e profissional.
                </h1>
                <p className="text-lg text-text-muted max-w-lg">
                  Transforme a gestão do seu salão com a Agendixx. Disponível 24h por dia para seus clientes, sem que
                  você precise parar o que está fazendo.
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <a
                  href="/admin/register"
                  className="bg-primary text-white h-14 px-8 rounded-xl text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Quero testar agora
                </a>
                <a
                  href="https://wa.me/5500000000000"
                  className="bg-white border border-border-light h-14 px-8 rounded-xl text-lg font-bold flex items-center gap-2 hover:bg-slate-50 transition-all"
                >
                  <span className="material-symbols-outlined">chat</span>
                  WhatsApp
                </a>
              </div>
            </div>
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl p-4 border border-border-light aspect-[4/3] w-full overflow-hidden">
                <img
                  alt="Interface do painel Agendixx"
                  className="rounded-xl w-full h-full object-cover grayscale-[0.2] hover:grayscale-0 transition-all duration-700"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBkGOE7j5jjprYWm_mA7Q6KQh3FZUhADalhe08IJKUB1I19y4KuPPkczWFQGz4a2ZZQnBf4eZVUxnO334FExHmI8vbD3UF7jnWMtjeH04i7pYM6i6462hxcBBgR-Nyr8r4yxVb-5Zlskg0Rl6tn_yLFWrclMC8hH7_6Yig2k2en1VEQlq9uD2SoXl4x5nVYAWSisdGHsIWYrhoYctuOmuDXF8kP-6FETNry9GbSnYgIsgRjzTT2XehgwCJ791Z5t26ZBqMt0nKZePk"
                />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-primary p-6 rounded-2xl shadow-xl hidden md:block">
                <p className="text-white text-3xl font-black">24h</p>
                <p className="text-white/80 text-xs font-bold uppercase">Agendamento Ativo</p>
              </div>
            </div>
          </section>

          <section className="bg-white py-20 border-y border-border-light" id="beneficios">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="text-center mb-16 space-y-4">
                <h2 className="text-4xl font-extrabold tracking-tight">Por que escolher a Agendixx?</h2>
                <p className="text-text-muted max-w-2xl mx-auto">
                  Tudo o que você precisa para gerenciar seu salão em um só lugar, com estética minimalista e alta
                  performance.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {benefits.map((item) => (
                  <div
                    key={item.title}
                    className="bg-background-light p-8 rounded-2xl border border-transparent hover:border-primary/30 transition-all shadow-sm group"
                  >
                    <div className="text-primary mb-6 group-hover:scale-110 transition-transform duration-300">
                      <span className="material-symbols-outlined text-4xl">{item.icon}</span>
                    </div>
                    <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                    <p className="text-sm text-text-muted leading-relaxed">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-24" id="como-funciona">
            <div className="max-w-[1000px] mx-auto px-6">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-extrabold tracking-tight">O caminho para o sucesso</h2>
                <p className="text-text-muted mt-4">Simplificamos tudo para você focar no que importa: seu trabalho.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
                <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-border-light to-transparent -z-10 -translate-y-12" />
                {steps.map((step, index) => (
                  <div key={step.title} className="flex flex-col items-center text-center group">
                    <div
                      className={[
                        "size-16 rounded-full flex items-center justify-center text-2xl font-black mb-6 shadow-lg",
                        index === 1
                          ? "bg-white border-4 border-primary text-text-main"
                          : "bg-primary text-white shadow-primary/30",
                      ].join(" ")}
                    >
                      {index + 1}
                    </div>
                    <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                    <p className="text-text-muted">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-text-main py-24 text-white" id="precos">
            <div className="max-w-[1200px] mx-auto px-6 flex flex-col items-center">
              <div className="text-center mb-12 space-y-4">
                <span className="text-primary font-bold uppercase tracking-tighter text-sm">Transparência total</span>
                <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight">Invista no seu crescimento</h2>
              </div>
              <div className="w-full max-w-[500px] bg-[#1f2937] border border-[#2f3b4f] rounded-[2rem] p-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-primary px-6 py-2 rounded-bl-2xl font-bold text-white text-xs">
                  MAIS POPULAR
                </div>
                <div className="flex flex-col gap-6 text-center">
                  <h3 className="text-2xl font-bold">Plano Profissional</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-2xl font-medium">R$</span>
                    <span className="text-7xl font-black text-primary">35</span>
                    <span className="text-lg text-white/60">/mês</span>
                  </div>
                  <p className="text-white/60 text-sm">Para o primeiro profissional cadastrado</p>
                  <div className="h-px bg-white/10 w-full my-2" />
                  <ul className="text-left space-y-4 mb-4">
                    {[
                      "Agendamentos Ilimitados",
                      "Lembretes por WhatsApp",
                      "+ R$ 15/mês por profissional extra",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary">
                          {item.startsWith("+") ? "add_circle" : "check_circle"}
                        </span>
                        <span className={item.startsWith("+") ? "font-bold" : ""}>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href="/admin/register"
                    className="bg-primary text-white py-4 rounded-xl text-lg font-bold hover:brightness-110 transition-all shadow-xl shadow-primary/10"
                  >
                    Começar Teste Grátis
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="py-24 bg-white">
            <div className="max-w-[1200px] mx-auto px-6">
              <h2 className="text-4xl font-extrabold tracking-tight text-center mb-16">O que dizem os profissionais</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {testimonials.map((item) => (
                  <div
                    key={item.name}
                    className="bg-background-light p-8 rounded-2xl border border-border-light"
                  >
                    <div className="flex gap-1 text-primary mb-4">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <span key={idx} className="material-symbols-outlined">
                          star
                        </span>
                      ))}
                    </div>
                    <p className="text-text-muted italic mb-6">{item.quote}</p>
                    <div className="flex items-center gap-4">
                      <div
                        className="size-12 rounded-full bg-gray-200"
                        style={{
                          backgroundImage: `url('${item.avatar}')`,
                          backgroundSize: "cover",
                        }}
                      />
                      <div>
                        <p className="font-bold">{item.name}</p>
                        <p className="text-xs text-primary font-semibold uppercase">{item.role}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-24 max-w-[800px] mx-auto px-6">
            <h2 className="text-3xl font-extrabold tracking-tight text-center mb-12">Dúvidas Frequentes</h2>
            <div className="space-y-4">
              {faqs.map((item) => (
                <div key={item.question} className="bg-white p-6 rounded-xl border border-border-light">
                  <h3 className="font-bold text-lg flex items-center justify-between">
                    {item.question}
                    <span className="material-symbols-outlined text-primary">expand_more</span>
                  </h3>
                  <p className="text-text-muted mt-4 text-sm leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="py-24 bg-primary px-6">
            <div className="max-w-[1000px] mx-auto bg-text-main rounded-[3rem] p-12 lg:p-20 text-center flex flex-col items-center gap-8 relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-10"
                style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #13b6ec 0%, transparent 50%)" }}
              />
              <h2 className="text-4xl lg:text-6xl font-black text-white tracking-tight leading-tight">
                Coloque seu salão no mundo digital hoje mesmo.
              </h2>
              <p className="text-white/70 text-lg max-w-xl">
                Junte-se a milhares de profissionais que economizam tempo e aumentam seu faturamento com a Agendixx.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <a
                  href="/admin/register"
                  className="bg-primary text-white h-16 px-10 rounded-2xl text-xl font-black hover:scale-[1.05] transition-transform"
                >
                  Começar agora mesmo
                </a>
              </div>
              <p className="text-white/60 text-sm font-semibold">Sem necessidade de cartão de crédito para testar.</p>
            </div>
          </section>
        </main>

        <footer className="bg-background-light border-t border-border-light py-12 px-6 lg:px-10">
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <div className="size-6 text-primary">
                  <svg fill="currentColor" viewBox="0 0 48 48">
                    <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
                  </svg>
                </div>
                <h2 className="text-lg font-black tracking-tight">Agendixx</h2>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Simplificando o agendamento de serviços de beleza e bem-estar no Brasil.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-primary">Produto</h4>
              <ul className="space-y-3 text-sm font-medium">
                <li>
                  <a className="hover:text-primary" href="#beneficios">
                    Funcionalidades
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href="#precos">
                    Preços
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href="#">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-primary">Suporte</h4>
              <ul className="space-y-3 text-sm font-medium">
                <li>
                  <a className="hover:text-primary" href="#">
                    Central de Ajuda
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href="https://wa.me/5500000000000">
                    WhatsApp
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href="#">
                    Status
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-primary">Legal</h4>
              <ul className="space-y-3 text-sm font-medium">
                <li>
                  <a className="hover:text-primary" href="#">
                    Termos de Uso
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary" href="#">
                    Privacidade
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="max-w-[1200px] mx-auto mt-12 pt-8 border-t border-border-light flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-text-muted">
            <p>© 2024 Agendixx Software de Agendamento Ltda.</p>
            <div className="flex gap-6">
              <a className="hover:text-primary transition-colors" href="#">
                Instagram
              </a>
              <a className="hover:text-primary transition-colors" href="#">
                LinkedIn
              </a>
              <a className="hover:text-primary transition-colors" href="#">
                Twitter
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
