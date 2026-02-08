import Image from "next/image";

export default function HomePage() {
  return (
    <main className="landing-theme font-landing antialiased bg-[hsl(210_40%_98%)] text-[hsl(215_25%_15%)]">
      <header className="sticky top-0 z-50 border-b border-[hsl(214_32%_91%)] bg-[rgba(255,255,255,0.8)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-8">
          <a href="/" className="flex items-center">
            <Image
              src="/logo-axk.png"
              alt="Agendixx"
              width={320}
              height={120}
              className="h-auto w-[180px] object-contain"
              priority
            />
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#para-quem" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
              Para quem
            </a>
            <a href="#como-funciona" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
              Como funciona
            </a>
            <a href="#funcionalidades" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
              Funcionalidades
            </a>
            <a href="#precos" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
              Preços
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href="/admin/login"
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-[hsl(215_25%_15%)] transition-colors hover:bg-[hsl(214_32%_95%)]"
            >
              Entrar
            </a>
            <a
              href="/admin/register"
              className="inline-flex items-center justify-center rounded-lg bg-[var(--landing-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--landing-primary-dark)]"
            >
              Começar agora
            </a>
          </div>

          <details className="md:hidden group">
            <summary className="list-none text-[hsl(215_25%_15%)]" aria-label="Abrir menu">
              <svg className="h-6 w-6 group-open:hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
              <svg className="h-6 w-6 hidden group-open:block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </summary>
            <div className="absolute left-0 right-0 top-full border-t border-[hsl(214_32%_91%)] bg-white px-4 pb-4">
              <nav className="flex flex-col gap-3 pt-3">
                <a href="#para-quem" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
                  Para quem
                </a>
                <a href="#como-funciona" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
                  Como funciona
                </a>
                <a href="#funcionalidades" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
                  Funcionalidades
                </a>
                <a href="#precos" className="text-sm font-medium text-[hsl(215_16%_47%)] transition-colors hover:text-[hsl(215_25%_15%)]">
                  Preços
                </a>
                <a
                  href="/admin/login"
                  className="mt-2 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-[hsl(215_25%_15%)] transition-colors hover:bg-[hsl(214_32%_95%)]"
                >
                  Entrar
                </a>
                <a
                  href="/admin/register"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--landing-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--landing-primary-dark)]"
                >
                  Começar agora
                </a>
              </nav>
            </div>
          </details>
        </div>
      </header>

      <section className="relative overflow-hidden bg-white py-20 lg:py-32">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-[var(--landing-primary-05)]" />
          <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-[var(--landing-primary-05)]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--landing-primary-20)] bg-[var(--landing-primary-05)] px-4 py-1.5 text-sm font-medium text-[var(--landing-primary)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--landing-primary)] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--landing-primary)]" />
              </span>
              Plataforma de agendamento online
            </div>

            <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-[hsl(215_25%_15%)] md:text-5xl lg:text-6xl">
              Agenda online simples e profissional para negócios de beleza
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[hsl(215_16%_47%)] lg:text-xl">
              Permita que seus clientes agendem sozinhos, 24 horas por dia, direto pelo seu link — sem confusão no WhatsApp.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="/admin/register"
                className="inline-flex items-center justify-center rounded-lg bg-[var(--landing-primary)] px-8 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--landing-primary-dark)]"
              >
                Testar grátis por 7 dias
                <svg className="ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </a>
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center rounded-lg border border-[hsl(214_32%_91%)] bg-transparent px-8 py-3 text-base font-medium text-[hsl(215_25%_15%)] transition-colors hover:bg-[hsl(214_32%_95%)]"
              >
                <svg className="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <polygon points="6 3 20 12 6 21 6 3" />
                </svg>
                Ver como funciona
              </a>
            </div>
            <p className="mt-4 text-sm text-[hsl(215_16%_47%)]">Sem cartão de crédito. Cancele quando quiser.</p>
          </div>

          <div className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-2xl border border-[hsl(214_32%_91%)] bg-white p-2 shadow-2xl shadow-[var(--landing-primary-shadow)]">
              <div className="rounded-xl bg-[hsl(214_32%_95%)] p-6 lg:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-[hsl(215_25%_15%)]">Studio Bella</h3>
                    <p className="text-sm text-[hsl(215_16%_47%)]">Selecione um horário</p>
                  </div>
                  <div className="rounded-lg bg-[var(--landing-primary-20)] px-3 py-1.5 text-sm font-medium text-[var(--landing-primary-dark)]">
                    Fevereiro 2026
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => (
                    <div key={day} className="py-2 text-center text-xs font-medium text-[hsl(215_16%_47%)]">
                      {day}
                    </div>
                  ))}
                  {Array.from({ length: 28 }).map((_, index) => {
                    const day = index + 1;
                    const highlighted = [8, 12, 15, 19, 22].includes(day);
                    const selected = day === 12;
                    return (
                      <div
                        key={day}
                        className={[
                          "flex h-10 items-center justify-center rounded-lg text-sm",
                          selected
                            ? "bg-[var(--landing-primary-dark)] font-semibold text-white"
                            : highlighted
                              ? "bg-[var(--landing-primary-10)] font-medium text-[var(--landing-primary)]"
                              : "text-[hsl(215_25%_15%)] hover:bg-[hsl(214_32%_91%)]",
                        ].join(" ")}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["09:00", "10:00", "11:30", "14:00", "15:30", "16:00"].map((time) => (
                    <div
                      key={time}
                      className={[
                        "rounded-lg border px-4 py-2 text-sm font-medium",
                        time === "14:00"
                          ? "border-[var(--landing-primary)] bg-[var(--landing-primary)] text-white"
                          : "border-[hsl(214_32%_91%)] bg-white text-[hsl(215_25%_15%)] hover:border-[var(--landing-primary-50)]",
                      ].join(" ")}
                    >
                      {time}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="para-quem" className="bg-[hsl(210_40%_98%)] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-[hsl(215_25%_15%)] md:text-4xl">Para quem é o Agendixx</h2>
            <p className="mt-4 text-lg text-[hsl(215_16%_47%)]">Se você trabalha com horários, o Agendixx foi feito para você.</p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Salões de beleza", desc: "Organize cortes, colorações e tratamentos em poucos cliques." },
              { title: "Barbearias", desc: "Gerencie a agenda dos barbeiros com praticidade." },
              { title: "Estúdios de sobrancelha", desc: "Agende design, henna e micropigmentação automaticamente." },
              { title: "Clínicas de estética", desc: "Controle procedimentos e horários de cada profissional." },
              { title: "Depilação", desc: "Otimize os atendimentos e evite encaixes manuais." },
            ].map((item) => (
              <div
                key={item.title}
                className="group rounded-xl border border-[hsl(214_32%_91%)] bg-white p-6 transition-all hover:border-[var(--landing-primary-30)] hover:shadow-lg hover:shadow-[var(--landing-primary-05)]"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--landing-primary-10)] text-[var(--landing-primary)] transition-colors group-hover:bg-[var(--landing-primary)] group-hover:text-white">
                  <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <circle cx="6" cy="6" r="3" />
                    <path d="M8.12 8.12 12 12" />
                    <circle cx="18" cy="18" r="3" />
                    <path d="M18 6v.01" />
                  </svg>
                </div>
                <h3 className="font-heading text-lg font-semibold text-[hsl(215_25%_15%)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(215_16%_47%)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div>
              <h2 className="font-heading text-3xl font-bold text-[hsl(215_25%_15%)] md:text-4xl">O problema que resolvemos</h2>
              <p className="mt-4 text-lg leading-relaxed text-[hsl(215_16%_47%)]">
                Sabemos como é difícil gerenciar uma agenda manualmente. Confusão, erros e perda de clientes fazem parte da rotina.
              </p>

              <ul className="mt-8 flex flex-col gap-4">
                {[
                  "Agenda desorganizada ou no papel",
                  "Mensagens no WhatsApp o dia todo",
                  "Clientes esquecem o horário",
                  "Dificuldade para visualizar a semana ou o mês",
                  "Erros de agendamento",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(0_84%_60%)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" />
                      <path d="m15 9-6 6" />
                      <path d="m9 9 6 6" />
                    </svg>
                    <span className="text-[hsl(215_25%_15%)]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-[var(--landing-primary-20)] bg-[var(--landing-primary-05)] p-8 lg:p-10">
                <p className="font-heading text-2xl font-bold leading-snug text-[hsl(215_25%_15%)] md:text-3xl">
                  Chega de perder tempo organizando agenda. Deixe o Agendixx fazer isso por você.
                </p>
                <div className="mt-6 h-1 w-16 rounded-full bg-[var(--landing-primary)]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-[hsl(210_40%_98%)] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-[hsl(215_25%_15%)] md:text-4xl">Como funciona</h2>
            <p className="mt-4 text-lg text-[hsl(215_16%_47%)]">
              Em 3 passos simples, seu negócio já está recebendo agendamentos online.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              {
                title: "Crie seus serviços e profissionais",
                desc: "Cadastre os serviços oferecidos e os profissionais do seu negócio em poucos minutos.",
                icon: (
                  <>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <path d="M12 11h4" />
                    <path d="M12 16h4" />
                    <path d="M8 11h.01" />
                    <path d="M8 16h.01" />
                  </>
                ),
              },
              {
                title: "Compartilhe o link do seu salão",
                desc: "Envie o link exclusivo para seus clientes via WhatsApp, Instagram ou redes sociais.",
                icon: (
                  <>
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </>
                ),
              },
              {
                title: "Receba agendamentos automáticos",
                desc: "Seus clientes agendam sozinhos, 24h por dia. Sem precisar de nenhuma mensagem.",
                icon: (
                  <>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <path d="m9 16 2 2 4-4" />
                  </>
                ),
              },
            ].map((step, index) => (
              <div key={step.title} className="relative text-center">
                {index < 2 ? (
                  <div className="absolute left-1/2 top-12 hidden h-0.5 w-full bg-[hsl(214_32%_91%)] md:block" />
                ) : null}
                <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--landing-primary-10)]">
                  <svg className="h-10 w-10 text-[var(--landing-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    {step.icon}
                  </svg>
                  <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--landing-primary)] text-sm font-bold text-white">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-heading text-lg font-semibold text-[hsl(215_25%_15%)]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(215_16%_47%)]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="funcionalidades" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-[hsl(215_25%_15%)] md:text-4xl">Principais funcionalidades</h2>
            <p className="mt-4 text-lg text-[hsl(215_16%_47%)]">Tudo o que você precisa para organizar seu negócio em um só lugar.</p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Agenda semanal e mensal",
                desc: "Visualize todos os agendamentos da semana ou do mês em um só lugar.",
              },
              {
                title: "Serviços e profissionais",
                desc: "Cadastre quantos serviços e profissionais precisar de forma simples.",
              },
              {
                title: "Link exclusivo do salão",
                desc: "Compartilhe um link personalizado para seus clientes agendarem online.",
              },
              {
                title: "Reservas automáticas 24h",
                desc: "Receba agendamentos a qualquer hora, mesmo fora do horário comercial.",
              },
              {
                title: "Visual simples e fácil",
                desc: "Interface intuitiva para você e seus clientes, sem complicação.",
              },
              {
                title: "Organização total",
                desc: "Tenha controle completo da agenda e nunca mais perca um horário.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="flex gap-4 rounded-xl border border-[hsl(214_32%_91%)] bg-[hsl(210_40%_98%)] p-6 transition-all hover:border-[var(--landing-primary-30)] hover:shadow-lg hover:shadow-[var(--landing-primary-05)]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--landing-primary-10)] text-[var(--landing-primary)]">
                  <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-[hsl(215_25%_15%)]">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[hsl(215_16%_47%)]">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[hsl(210_40%_98%)] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <div className="relative order-2 lg:order-1">
              <div className="rounded-2xl border border-[var(--landing-primary-20)] bg-[var(--landing-primary)] p-8 lg:p-10">
                <p className="font-heading text-2xl font-bold leading-snug text-white md:text-3xl">O cliente agenda. Você só atende.</p>
                <div className="mt-6 h-1 w-16 rounded-full bg-[rgba(255,255,255,0.3)]" />
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <h2 className="font-heading text-3xl font-bold text-[hsl(215_25%_15%)] md:text-4xl">
                Benefícios claros para o seu negócio
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[hsl(215_16%_47%)]">
                Pare de perder tempo com tarefas manuais. Foque no que importa: atender bem seus clientes.
              </p>

              <ul className="mt-8 flex flex-col gap-4">
                {[
                  "Menos mensagens no WhatsApp",
                  "Mais organização",
                  "Mais profissionalismo",
                  "Menos erros de horário",
                  "Mais tempo para atender clientes",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <svg className="h-5 w-5 shrink-0 text-[var(--landing-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <path d="m9 11 3 3L22 4" />
                    </svg>
                    <span className="text-[hsl(215_25%_15%)] font-medium">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="precos" className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-[hsl(215_25%_15%)] md:text-4xl">Planos e preços</h2>
            <p className="mt-4 text-lg text-[hsl(215_16%_47%)]">Um plano simples, sem surpresas. Tudo incluso.</p>
          </div>

          <div className="mx-auto mt-14 max-w-md">
            <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--landing-primary)] bg-white shadow-xl shadow-[var(--landing-primary-shadow)]">
              <div className="bg-[var(--landing-primary)] px-6 py-3 text-center">
                <span className="text-sm font-semibold text-white">7 dias grátis — Plano Agendixx</span>
              </div>

              <div className="p-8 lg:p-10">
                <div className="text-center">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-sm font-medium text-[hsl(215_16%_47%)]">R$</span>
                    <span className="font-heading text-5xl font-bold text-[hsl(215_25%_15%)]">49,90</span>
                    <span className="text-sm font-medium text-[hsl(215_16%_47%)]">/ mês</span>
                  </div>
                </div>

                <ul className="mt-8 flex flex-col gap-3">
                  {[
                    "Até 2 profissionais (2 agendas)",
                    "Agendamentos ilimitados",
                    "Agenda semanal e mensal",
                    "Link exclusivo do salão",
                    "Suporte básico",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--landing-primary-10)]">
                        <svg className="h-3.5 w-3.5 text-[var(--landing-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span className="text-[hsl(215_25%_15%)]">{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 rounded-lg bg-[hsl(214_32%_95%)] p-4">
                  <p className="text-sm text-[hsl(215_25%_15%)]">
                    <span className="font-semibold">Profissional extra:</span> R$ 15,00 por mês
                  </p>
                </div>

                <a
                  href="/admin/register"
                  className="mt-8 flex w-full items-center justify-center rounded-lg bg-[var(--landing-primary)] px-6 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--landing-primary-dark)]"
                >
                  Testar grátis por 7 dias
                  <svg className="ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </a>

                <p className="mt-4 text-center text-sm text-[hsl(215_16%_47%)]">
                  Sem cartão de crédito. Sem taxa por agendamento. Cancele quando quiser.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[hsl(210_40%_98%)] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold text-[hsl(215_25%_15%)] md:text-4xl">
              Confiança para o seu negócio
            </h2>
            <p className="mt-4 text-lg text-[hsl(215_16%_47%)]">
              Plataforma simples, segura e pensada para pequenos negócios de beleza.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              { title: "Segura", desc: "Seus dados e os dos seus clientes protegidos." },
              { title: "Simples", desc: "Feita para quem não é de tecnologia." },
              { title: "Para pequenos negócios", desc: "Pensada especialmente para profissionais de beleza." },
            ].map((item) => (
              <div key={item.title} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--landing-primary-10)] text-[var(--landing-primary)]">
                  <svg className="h-7 w-7" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                  </svg>
                </div>
                <h3 className="font-heading text-lg font-semibold text-[hsl(215_25%_15%)]">{item.title}</h3>
                <p className="mt-2 text-sm text-[hsl(215_16%_47%)]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--landing-primary)] py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 text-center lg:px-8">
          <h2 className="font-heading text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Comece hoje a organizar sua agenda
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[rgba(255,255,255,0.8)]">
            Em poucos minutos seu salão já pode receber agendamentos online. Teste grátis por 7 dias.
          </p>
          <a
            href="/admin/register"
            className="mt-10 inline-flex items-center justify-center rounded-lg bg-[hsl(214_32%_91%)] px-10 py-3 text-base font-semibold text-[hsl(215_25%_15%)] transition-colors hover:bg-[hsl(214_32%_80%)]"
          >
            Testar grátis por 7 dias
            <svg className="ml-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <p className="mt-4 text-sm text-[rgba(255,255,255,0.6)]">Sem cartão de crédito. Cancele quando quiser.</p>
        </div>
      </section>

      <footer className="border-t border-[hsl(214_32%_91%)] bg-white py-10">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
            <div className="flex items-center">
              <Image
                src="/logo-axk.png"
                alt="Agendixx"
                width={260}
                height={96}
                className="h-auto w-[140px] object-contain"
              />
            </div>
            <p className="text-sm text-[hsl(215_16%_47%)]">Plataforma de agendamento online para negócios de beleza</p>
            <p className="text-sm text-[hsl(215_16%_47%)]">© 2026 Agendixx. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
